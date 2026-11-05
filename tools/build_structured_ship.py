# -*- coding: utf-8 -*-
"""Convert the Natural Selection STL into a structured, textured ship model.

Pipeline
  1. parse binary STL, weld vertices, label connected components
  2. classify every triangle into exactly ONE semantic part (spatial rules)
  3. bake hand-consistent coordinate frame (Y-up, nose at -Z) and normalise length
  4. give each part its own atlas slot via per-face box projection (UV never
     leaves its own slot -> no misalignment / no overlap by construction)
  5. build a procedural PBR atlas set from the reference-image palette:
     basecolor / normal / metallic-roughness / emissive
  6. emit a standard glTF 2.0 GLB (one node per part), an inline JS payload for
     the existing UMD app, manifest.json and bindings.json
  7. assert the binding invariants: no missing, no misplaced, no duplicated

Usage
  python tools/build_structured_ship.py --stl <file> --refs <dir> [--glb <file>]
                                        --out <dir> [--length 76] [--atlas 2048]

Requires: numpy, Pillow.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import struct
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
SEED = 20261105

# ---------------------------------------------------------------- part table
# id, chinese name, atlas slot, base colour, roughness, metalness, emissive gain,
# primary design reference, note
PARTS = [
    ("engine_pods",    "引擎喷口模块",   (36, 58, 104), 0.34, 0.78, 1.00, "ref_02", "圆环内两具对称喷口/推进核心"),
    ("aft_booms",      "尾部双叉推进杆", (22, 38, 86),  0.30, 0.72, 0.85, "ref_04", "Z<20 的双叉细杆，蓝色晶体推进束"),
    ("nose_cone",      "舰首锥",         (206, 214, 224), 0.58, 0.30, 0.00, "ref_03", "Z>145 收尖舰首，橙色中线条"),
    ("forward_hull",   "前段舰体",       (198, 208, 219), 0.62, 0.34, 0.00, "ref_01", "主舰体前段，白装甲板 + 橙色纵饰条"),
    ("waist",          "环—体连接腰段",   (128, 138, 150), 0.66, 0.46, 0.00, "ref_01", "圆环与长舰体之间的连接箍"),
    ("radiator_fins",  "散热鳍片",       (176, 186, 197), 0.70, 0.42, 0.00, "ref_05", "圆环上下外缘的密集散热片"),
    ("ring_outer",     "环形外圈装甲",   (212, 220, 229), 0.55, 0.38, 0.00, "ref_04", "大圆环外圈，分段装甲 + 橙色箍带"),
    ("ring_frame",     "环内桁架",       (104, 114, 127), 0.72, 0.56, 0.00, "ref_02", "圆环内框与斜向桁架"),
    ("bridge_deck",    "舰桥上层甲板",   (218, 226, 234), 0.52, 0.32, 0.06, "ref_05", "上表面舰桥、舷窗与观测模块"),
    ("hub_core",       "中央轮毂",       (86, 96, 110), 0.74, 0.60, 0.00, "ref_04", "圆环中央机械核心"),
]
PID = {p[0]: i for i, p in enumerate(PARTS)}

# Reference images: every supplied design image is bound exactly once.
DESIGN_REFS = [
    ("ref_01", "ScreenShot_2026-11-04_221706_400_抠图 - 复制.png", "左舷侧视长条",
     ["forward_hull", "waist", "ring_outer", "nose_cone"],
     "确定舰体白/灰比例、橙色纵饰条走向、舰腹深灰机械带"),
    ("ref_02", "ScreenShot_2026-11-04_221621_470_抠图.png", "斜后 3/4 俯视",
     ["ring_outer", "ring_frame", "engine_pods", "aft_booms"],
     "确定圆环分段、蓝色推进束与双叉结构、橙蓝配色位置"),
    ("ref_03", "ScreenShot_2026-11-04_221653_579_抠图 - 复制.png", "斜前 3/4 俯视",
     ["nose_cone", "forward_hull", "ring_frame", "waist"],
     "确定舰首橙色中线、前段装甲板分界与舷侧标记"),
    ("ref_04", "ScreenShot_2026-11-04_221721_663_抠图_多角度_抠图.png", "正俯视总图",
     ["ring_outer", "hub_core", "nose_cone", "aft_booms", "radiator_fins"],
     "确定全舰平面轮廓、圆环直径/舰长比例、双叉对称性"),
    ("ref_05", "ScreenShot_2026-11-04_221737_303_智能超清+2k_抠图-Lite.png", "舰桥局部放大",
     ["bridge_deck", "radiator_fins", "hub_core"],
     "确定舷窗蓝色圆阵、散热片细密平行线、深灰机械细节"),
]

# ------------------------------------------------------------------ utilities
def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def extract_source_pbr(glb_path, out_dir):
    """Preserve the full PBR texture set from the previously supplied GLB.

    The STL has no UVs, so these maps cannot be projected onto the new mesh
    without inventing a correspondence. They are kept byte-for-byte as a
    traceable detail source and listed in the binding manifest.
    """
    if not glb_path or not os.path.exists(glb_path):
        return []
    raw = open(glb_path, "rb").read()
    (jlen,) = struct.unpack_from("<I", raw, 12)
    js = json.loads(raw[20:20 + jlen].decode("utf-8"))
    bo = 20 + jlen + 8
    mat = js["materials"][0]
    pbr = mat.get("pbrMetallicRoughness", {})
    wanted = [("baseColor", pbr.get("baseColorTexture", {}).get("index")),
              ("normal", mat.get("normalTexture", {}).get("index")),
              ("metallicRoughness", pbr.get("metallicRoughnessTexture", {}).get("index"))]
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for name, ti in wanted:
        if ti is None:
            continue
        src = js["textures"][ti].get("source")
        bv = js["bufferViews"][js["images"][src]["bufferView"]]
        st = bo + bv.get("byteOffset", 0)
        data = raw[st:st + bv["byteLength"]]
        im = Image.open(io.BytesIO(data))
        fn = "source_%s.png" % name
        im.save(os.path.join(out_dir, fn))
        out.append({"name": name, "file": "textures/source/" + fn,
                    "size": list(im.size), "bytes": len(data), "sha256": sha(data),
                    "usage": "traceable detail source; no UV on STL, not projected directly"})
    return out


def read_stl(path):
    raw = open(path, "rb").read()
    n = struct.unpack_from("<I", raw, 80)[0]
    dt = np.dtype([("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")])
    a = np.frombuffer(raw, dtype=dt, count=n, offset=84)
    V = a["v"].reshape(-1, 3).astype(np.float64)
    N = a["n"].reshape(-1, 3).astype(np.float64)
    return V, N, raw


def weld(V, digits=4):
    _, inv = np.unique(np.round(V, digits), axis=0, return_inverse=True)
    P = np.zeros((inv.max() + 1, 3), dtype=np.float64)
    np.add.at(P, inv, V)
    cnt = np.bincount(inv).astype(np.float64)[:, None]
    P /= np.maximum(cnt, 1)
    return P, inv.reshape(-1, 3).astype(np.int32)


def components(P, F):
    """Union-find on welded vertices; returns (face_component, sizes)."""
    parent = np.arange(len(P), dtype=np.int32)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(int(x)), find(int(y))
        if rx != ry:
            parent[ry] = rx

    for f in F:
        union(f[0], f[1])
        union(f[1], f[2])
    roots = np.array([find(i) for i in range(len(P))], dtype=np.int32)
    fr = roots[F[:, 0]]
    _, comp = np.unique(fr, return_inverse=True)
    sizes = np.bincount(comp)
    return comp.astype(np.int32), sizes


def classify(P, F, comp, sizes):
    """Assign exactly one part id to every triangle. Order = priority."""
    C = P[F].mean(axis=1)
    x, y, z = C[:, 0], C[:, 1], C[:, 2]
    zc, yc = 65.0, 43.0
    dy = np.abs(y - yc)
    r = np.sqrt((z - zc) ** 2 + (y - yc) ** 2)

    main = int(np.argmax(sizes))
    pid = np.full(len(F), -1, np.int32)

    def put(name, mask):
        m = mask & (pid < 0)
        pid[m] = PID[name]
        return int(m.sum())

    counts = {}
    counts["engine_pods"] = put("engine_pods", comp != main)
    counts["aft_booms"] = put("aft_booms", z < 20)
    counts["nose_cone"] = put("nose_cone", z > 145)
    counts["forward_hull"] = put("forward_hull", z > 112)
    counts["waist"] = put("waist", z > 100)
    counts["radiator_fins"] = put("radiator_fins", (dy > 37) & (z > 28) & (z < 100))
    counts["ring_outer"] = put("ring_outer", r > 33)
    counts["ring_frame"] = put("ring_frame", r > 17)
    counts["bridge_deck"] = put("bridge_deck", x > 26)
    counts["hub_core"] = put("hub_core", np.ones(len(F), dtype=bool))

    assert (pid >= 0).all(), "unclassified triangles: %d" % int((pid < 0).sum())
    return pid, counts


def make_frame(P, F, face_n, length):
    """STL (x=thickness, y=ring diameter, z=long axis, nose at +Z)
    -> Three.js Y-up (tx=y, ty=x, tz=-z). Determinant +1, no mirroring."""
    mn, mx = P.min(axis=0), P.max(axis=0)
    c = (mn + mx) / 2.0
    s = length / (mx[2] - mn[2])
    Q = np.stack([(P[:, 1] - c[1]) * s,
                  (P[:, 0] - c[0]) * s,
                  -(P[:, 2] - c[2]) * s], axis=1)
    # smooth vertex normals from face normals
    FN = face_n / np.maximum(np.linalg.norm(face_n, axis=1, keepdims=True), 1e-9)
    VN = np.zeros_like(P)
    for k in range(3):
        np.add.at(VN, F[:, k], FN)
    VN /= np.maximum(np.linalg.norm(VN, axis=1, keepdims=True), 1e-9)
    QN = np.stack([VN[:, 1], VN[:, 0], -VN[:, 2]], axis=1)
    return Q, QN, dict(center=c.tolist(), scale=s, source_bounds=[mn.tolist(), mx.tolist()],
                       mapping="Three(tx,ty,tz) = (STL_y, STL_x, -STL_z), origin at bbox centre")


# --------------------------------------------------------------- texture atlas
def _panel_draw(draw, box, rng, base, dark, accent, kind):
    x0, y0, x1, y1 = box
    draw.rectangle(box, fill=base)
    # panel grid
    for _ in range(rng.integers(7, 13)):
        px = rng.integers(x0 + 6, x1 - 6)
        draw.line([(px, y0 + 4), (px, y1 - 4)], fill=dark, width=rng.integers(2, 4))
    for _ in range(rng.integers(5, 10)):
        py = rng.integers(y0 + 6, y1 - 6)
        draw.line([(x0 + 4, py), (x1 - 4, py)], fill=dark, width=rng.integers(2, 4))
    # rivets
    for _ in range(rng.integers(18, 38)):
        rx, ry = rng.integers(x0 + 8, x1 - 8), rng.integers(y0 + 8, y1 - 8)
        draw.ellipse((rx, ry, rx + 2, ry + 2), fill=dark)
    if kind == "ring":
        for k in range(6):
            xx = x0 + int((k + .5) * (x1 - x0) / 6)
            draw.rectangle((xx - 7, y0, xx + 7, y1), fill=accent)
        for k in range(4):
            yy = y0 + int((k + .5) * (y1 - y0) / 4)
            draw.line([(x0, yy), (x1, yy)], fill=(70, 120, 190), width=2)
        draw.text((x0 + 14, y0 + 14), "NS-01  GRAVITY RING", fill=(70, 84, 100))
    elif kind == "fins":
        for k in range(y0 + 6, y1 - 4, 9):
            draw.line([(x0 + 4, k), (x1 - 4, k)], fill=(72, 82, 94), width=3)
            draw.line([(x0 + 4, k + 3), (x1 - 4, k + 3)], fill=(240, 243, 247), width=1)
    elif kind == "hull":
        draw.rectangle((x0 + 20, y0 + 8, x1 - 20, y0 + 34), fill=accent)
        draw.rectangle((x0 + 34, y0 + 40, x0 + 52, y1 - 20), fill=accent)
        draw.text((x0 + 24, y1 - 40), "NATURAL SELECTION", fill=(78, 90, 104))
        for k in range(5):
            xx = x0 + 30 + k * 70
            draw.ellipse((xx, y1 // 2, xx + 8, y1 // 2 + 8), fill=(48, 96, 176))
    elif kind == "nose":
        draw.rectangle(((x0 + x1) // 2 - 22, y0, (x0 + x1) // 2 + 22, y1), fill=accent)
        for k in range(y0 + 20, y1 - 10, 26):
            draw.line([(x0 + 10, k), (x1 - 10, k)], fill=(96, 108, 122), width=2)
    elif kind == "bridge":
        for k in range(6):
            for j in range(3):
                xx = x0 + 24 + k * 66
                yy = y0 + 30 + j * 60
                draw.ellipse((xx, yy, xx + 22, yy + 22), fill=(38, 82, 158), outline=(190, 200, 212), width=2)
        draw.rectangle((x0, y1 - 32, x1, y1 - 12), fill=accent)
    elif kind == "mech":
        for _ in range(14):
            xx, yy = rng.integers(x0 + 8, x1 - 30), rng.integers(y0 + 8, y1 - 30)
            draw.rectangle((xx, yy, xx + rng.integers(10, 30), yy + rng.integers(8, 22)),
                           outline=dark, width=2)
        for k in range(0, x1 - x0, 24):
            draw.line([(x0 + k, y0), (x0 + k - 40, y1)], fill=(160, 168, 178), width=1)
    elif kind == "engine":
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        for rad in range(20, 190, 22):
            draw.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), outline=(36, 92, 196), width=3)
        draw.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), fill=(86, 164, 255))
    elif kind == "boom":
        for k in range(0, x1 - x0, 13):
            xx = x0 + k
            draw.line([(xx, y0 + 6), (xx + 8, y1 - 6)],
                      fill=(40, 96, 206) if k % 26 else (96, 168, 255), width=2)
        draw.rectangle((x0 + 6, y0 + 6, x1 - 6, y0 + 16), fill=(150, 205, 255))


def build_atlases(size, slot, refs_dir):
    """Return 4 PIL images (basecolor/normal/mr/emissive) + slot rects."""
    cols = size // slot
    rows = (len(PARTS) + cols - 1) // cols
    assert rows * slot <= size, "atlas too small for %d parts" % len(PARTS)
    rng = np.random.default_rng(SEED)
    base = Image.new("RGB", (size, size), (18, 22, 28))
    emis = Image.new("RGB", (size, size), (0, 0, 0))
    mr = Image.new("RGB", (size, size), (255, 200, 40))
    height = Image.new("L", (size, size), 128)
    db, de, dm, dh = (ImageDraw.Draw(x) for x in (base, emis, mr, height))
    rects = []
    kinds = ["engine", "boom", "nose", "hull", "mech", "fins",
             "ring", "mech", "bridge", "mech"]
    for i, p in enumerate(PARTS):
        name, cn, col, rough, metal, egain, ref, note = p
        cx, cy = (i % cols) * slot, (i // cols) * slot
        box = (cx + 6, cy + 6, cx + slot - 6, cy + slot - 6)
        # glTF UV convention: v=0 is the TOP row of the image. The inline JS
        # loader sets texture.flipY=false so both artifacts share this frame.
        rects.append({"part": name, "slot": i, "px": [cx, cy, cx + slot, cy + slot],
                      "uv": [cx / size, cy / size,
                             (cx + slot) / size, (cy + slot) / size]})
        dark = tuple(max(0, int(v * .32)) for v in col)
        accent = (224, 140, 38)
        _panel_draw(db, box, rng, col, dark, accent, kinds[i])
        # metallic-roughness: glTF G=roughness, B=metalness
        gm = (255, int(rough * 255), int(metal * 255))
        dm.rectangle((cx, cy, cx + slot - 1, cy + slot - 1), fill=gm)
        dh.rectangle((cx, cy, cx + slot - 1, cy + slot - 1), fill=140)
        if egain > 0:
            _panel_draw(de, box, rng, (10, 18, 34), (6, 12, 24), (40, 110, 220), kinds[i])
            d = ImageDraw.Draw(emis)
            # blue glow only where the reference puts the drive beams
            d.rectangle((cx + slot * .26, cy + slot * .14,
                         cx + slot * .74, cy + slot * .86), outline=(70, 150, 255), width=12)
            d.ellipse((cx + slot * .38, cy + slot * .38,
                       cx + slot * .62, cy + slot * .62), fill=(120, 200, 255))
    # panel seams read as shallow grooves
    arr = np.asarray(base.convert("L"), dtype=np.float32) / 255.0
    h = 128 + (arr - arr.mean()) * 90
    h_img = Image.fromarray(np.clip(h, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))
    hn = np.asarray(h_img, dtype=np.float32)
    gx = np.zeros_like(hn); gy = np.zeros_like(hn)
    gx[:, 1:-1] = hn[:, 2:] - hn[:, :-2]
    gy[1:-1, :] = hn[2:, :] - hn[:-2, :]
    nx, ny, nz = -gx * .035, -gy * .035, np.ones_like(hn)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([(nx / ln * .5 + .5) * 255,
                       (ny / ln * .5 + .5) * 255,
                       (nz / ln * .5 + .5) * 255], axis=2).astype(np.uint8)
    return (base, Image.fromarray(normal), mr, emis), rects


# ------------------------------------------------------------------- UV / parts
def build_parts(Q, QN, F, pid, size, slot, rects):
    """One indexed mesh per part, face-corner vertices (box-projected UV)."""
    out = []
    for i, p in enumerate(PARTS):
        sel = np.where(pid == i)[0]
        f = F[sel]
        v = Q[f].reshape(-1, 3)
        n = QN[f].reshape(-1, 3)
        fn = np.cross(Q[f[:, 1]] - Q[f[:, 0]], Q[f[:, 2]] - Q[f[:, 0]])
        fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-9)
        axis = np.argmax(np.abs(fn), axis=1)
        uv = np.zeros((len(f), 3, 2), dtype=np.float32)
        # box projection inside this part's bbox
        lo, hi = v.min(axis=0), v.max(axis=0)
        ext = np.maximum(hi - lo, 1e-3)
        P3 = Q[f]
        for k, (u_idx, v_idx) in enumerate([(0, 1), (0, 2), (2, 1)]):
            m = axis == k
            if not m.any():
                continue
            u = (P3[m, :, u_idx] - lo[u_idx]) / ext[u_idx]
            w = (P3[m, :, v_idx] - lo[v_idx]) / ext[v_idx]
            uv[m, :, 0], uv[m, :, 1] = u, w
        rect = rects[i]["px"]
        pad = 10 / slot
        u0 = rect[0] / size + pad
        v0 = rect[1] / size + pad
        du = (rect[2] - rect[0]) / size - 2 * pad
        dv = (rect[3] - rect[1]) / size - 2 * pad
        uv[..., 0] = u0 + np.clip(uv[..., 0], 0, 1) * du
        uv[..., 1] = v0 + np.clip(uv[..., 1], 0, 1) * dv
        idx = np.arange(len(f) * 3, dtype=np.uint32)
        out.append(dict(id=p[0], name=p[1], slot=i, tris=len(f),
                        pos=v.astype(np.float32), nrm=n.astype(np.float32),
                        uv=uv.reshape(-1, 2).astype(np.float32), idx=idx,
                        bounds=[lo.tolist(), hi.tolist()]))
    return out


# --------------------------------------------------------------------- GLB out
class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.bvs, self.accs = [], []

    def add(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.bvs.append(bv)
        return len(self.bvs) - 1

    def acc(self, arr, typ, comp, target=None, bounds=False):
        b = self.add(np.ascontiguousarray(arr).tobytes(), target)
        a = {"bufferView": b, "componentType": comp, "count": len(arr), "type": typ}
        if bounds:
            a["min"] = arr.min(axis=0).astype(float).tolist()
            a["max"] = arr.max(axis=0).astype(float).tolist()
        self.accs.append(a)
        return len(self.accs) - 1


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_glb(path, parts, imgs, frame):
    g = GLB()
    img_bvs = []
    for im in imgs:
        img_bvs.append(g.add(png_bytes(im)))
    meshes, nodes, materials = [], [], []
    for p in parts:
        pa = g.acc(p["pos"], "VEC3", 5126, 34962, bounds=True)
        na = g.acc(p["nrm"], "VEC3", 5126, 34962)
        ua = g.acc(p["uv"], "VEC2", 5126, 34962)
        ia = g.acc(p["idx"], "SCALAR", 5125, 34963)
        mi = len(materials)
        spec = PARTS[p["slot"]]
        materials.append({
            "name": p["name"],
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicRoughnessTexture": {"index": 2},
                "metallicFactor": 1.0, "roughnessFactor": 1.0,
                "baseColorFactor": [1, 1, 1, 1]},
            "normalTexture": {"index": 1, "scale": 0.7},
            "emissiveTexture": {"index": 3},
            "emissiveFactor": [spec[5], spec[5], spec[5]],
            "doubleSided": True,
        })
        meshes.append({"name": p["name"], "primitives": [{
            "attributes": {"POSITION": pa, "NORMAL": na, "TEXCOORD_0": ua},
            "indices": ia, "material": mi, "mode": 4}]})
        nodes.append({"name": "%s / %s" % (p["id"], p["name"]), "mesh": len(meshes) - 1})
    textures = [{"source": i, "sampler": 0} for i in range(4)]
    js = {
        "asset": {"version": "2.0", "generator": "WorkBuddy structured-ship builder"},
        "extras": {"source": "Natural Selection-Full.stl", "frame": frame,
                   "partCount": len(parts),
                   "atlasSlots": len(PARTS)},
        "scene": 0,
        "scenes": [{"nodes": [len(nodes)]}],
        "nodes": nodes + [{"name": "NS-01 Natural Selection (structured)",
                           "children": list(range(len(nodes)))}],
        "meshes": meshes, "materials": materials,
        "textures": textures,
        "images": [{"bufferView": b, "mimeType": "image/png", "name": n}
                   for b, n in zip(img_bvs, ["atlas_basecolor", "atlas_normal",
                                             "atlas_mr", "atlas_emissive"])],
        "samplers": [{"magFilter": 9729, "minFilter": 9987,
                      "wrapS": 33071, "wrapT": 33071}],
        "accessors": g.accs, "bufferViews": g.bvs,
        "buffers": [{"byteLength": len(g.bin)}],
    }
    jb = json.dumps(js, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = bytes(g.bin) + b"\0" * ((4 - len(g.bin) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(jb), b"JSON")); f.write(jb)
        f.write(struct.pack("<I4s", len(bb), b"BIN\0")); f.write(bb)
    return total


def write_js(path, parts, imgs, frame, manifest):
    payload = {
        "version": manifest["version"], "frame": frame,
        "atlas": {"size": manifest["atlas"]["size"], "slot": manifest["atlas"]["slot"]},
        "textures": {k: "data:image/png;base64," + base64.b64encode(png_bytes(im)).decode("ascii")
                     for k, im in zip(["basecolor", "normal", "mr", "emissive"], imgs)},
        "parts": [{"id": p["id"], "name": p["name"], "slot": p["slot"], "tris": p["tris"],
                   "pos": b64(p["pos"]), "nrm": b64(p["nrm"]),
                   "uv": b64(p["uv"]), "idx": b64(p["idx"]),
                   "material": {"roughness": PARTS[p["slot"]][3],
                                "metalness": PARTS[p["slot"]][4],
                                "emissive": PARTS[p["slot"]][5]}}
                  for p in parts],
    }
    txt = "window.NS_STRUCTURED = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(path, "w", encoding="utf-8", newline="\n").write(txt)
    return len(txt)


# ----------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stl", required=True)
    ap.add_argument("--refs", required=True, help="directory with the 5 design images")
    ap.add_argument("--glb", default=None, help="optional source GLB with PBR maps")
    ap.add_argument("--out", required=True)
    ap.add_argument("--length", type=float, default=76.0)
    ap.add_argument("--atlas", type=int, default=2048)
    args = ap.parse_args()

    t0 = time.time()
    os.makedirs(args.out, exist_ok=True)
    tex_dir = os.path.join(args.out, "textures")
    ref_dir = os.path.join(args.out, "design-refs")
    os.makedirs(tex_dir, exist_ok=True)
    os.makedirs(ref_dir, exist_ok=True)

    V, FN, stl_raw = read_stl(args.stl)
    P, F = weld(V)
    comp, sizes = components(P, F)
    pid, counts = classify(P, F, comp, sizes)
    Q, QN, frame = make_frame(P, F, FN, args.length)
    print("STL", len(V) // 3, "tris ->", len(P), "verts;", len(sizes), "components", flush=True)
    print("PARTS", counts, flush=True)

    # reference images: copy all of them, fail loudly if any is absent
    import shutil
    ref_records = []
    for rid, fn, view, part_ids, note in DESIGN_REFS:
        src = os.path.join(args.refs, fn)
        if not os.path.exists(src):
            raise FileNotFoundError("missing design image: " + src)
        dst = os.path.join(ref_dir, rid + ".png")
        shutil.copy2(src, dst)
        with Image.open(dst) as im:
            wh = list(im.size)
        ref_records.append({"id": rid, "file": "design-refs/" + rid + ".png",
                            "source": fn, "view": view, "size": wh,
                            "sha256": sha(open(dst, "rb").read()),
                            "boundParts": part_ids, "designNotes": note})

    source_pbr = extract_source_pbr(args.glb, os.path.join(tex_dir, "source"))
    print("SOURCE_PBR_MAPS", len(source_pbr), flush=True)

    imgs, rects = build_atlases(args.atlas, args.atlas // 4, args.refs)
    for name, im in zip(["atlas_basecolor.png", "atlas_normal.png",
                         "atlas_mr.png", "atlas_emissive.png"], imgs):
        im.save(os.path.join(tex_dir, name), optimize=True)
    parts = build_parts(Q, QN, F, pid, args.atlas, args.atlas // 4, rects)

    # ---- binding invariants (hard gate) ----
    assert len(parts) == len(PARTS) == len(rects)
    assert sum(p["tris"] for p in parts) == len(F), "face partition not exhaustive"
    assert len({r["slot"] for r in rects}) == len(rects), "duplicate atlas slot"
    assert len({r["part"] for r in rects}) == len(rects), "duplicate part binding"
    for p in parts:
        u, v = p["uv"][:, 0], p["uv"][:, 1]
        r = rects[p["slot"]]["uv"]
        assert u.min() >= r[0] - 1e-6 and u.max() <= r[2] + 1e-6, "UV out of slot (u) " + p["id"]
        assert v.min() >= r[1] - 1e-6 and v.max() <= r[3] + 1e-6, "UV out of slot (v) " + p["id"]
        assert p["slot"] == PID[p["id"]], "part/slot mismatch"
    refs_bound = [x for rec in ref_records for x in rec["boundParts"]]
    assert len({r["id"] for r in ref_records}) == len(DESIGN_REFS) == 5, "design refs not all bound"
    assert set(refs_bound) <= set(PID), "unknown part in design ref"
    assert set(PID) <= set(refs_bound), "part missing a design ref: %s" % (set(PID) - set(refs_bound))
    print("BINDING_ASSERTIONS_OK", flush=True)

    glb_path = os.path.join(args.out, "ship-structured.glb")
    js_path = os.path.join(args.out, "ship-structured.js")
    glb_size = write_glb(glb_path, parts, imgs, frame)
    js_size = write_js(js_path, parts, imgs, frame,
                       {"version": "1.0.0", "atlas": {"size": args.atlas, "slot": args.atlas // 4}})

    manifest = {
        "version": "1.0.0",
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source": {"stl": os.path.basename(args.stl), "sha256": sha(stl_raw),
                   "triangles": len(F), "weldedVertices": len(P),
                   "connectedComponents": int(len(sizes)),
                   "componentFaces": sizes.tolist()},
        "frame": frame,
        "atlas": {"size": args.atlas, "slot": args.atlas // 4,
                  "layout": "%d slots, one per part" % len(PARTS),
                  "maps": ["atlas_basecolor.png", "atlas_normal.png",
                           "atlas_mr.png", "atlas_emissive.png"]},
        "parts": [{"id": p["id"], "name": p["name"], "slot": p["slot"],
                   "triangles": p["tris"], "bounds": p["bounds"],
                   "material": {"roughness": PARTS[p["slot"]][3],
                                "metalness": PARTS[p["slot"]][4],
                                "emissiveGain": PARTS[p["slot"]][5]},
                   "note": PARTS[p["slot"]][7]} for p in parts],
        "artifacts": {"glb": "ship-structured.glb", "inlineJS": "ship-structured.js",
                      "bindings": "bindings.json", "textures": "textures/",
                      "designRefs": "design-refs/"},
        "partitionRules": [
            "independent connected components != largest -> engine_pods",
            "z < 20 -> aft_booms",
            "z > 145 -> nose_cone",
            "z > 112 -> forward_hull",
            "z > 100 -> waist",
            "abs(y-43) > 37 and 28 < z < 100 -> radiator_fins",
            "r = hypot(z-65, y-43) > 33 -> ring_outer",
            "r > 17 -> ring_frame",
            "x > 26 -> bridge_deck",
            "otherwise -> hub_core",
        ],
        "verification": {"everyTriangleOnePart": True,
                         "sumPartTriangles": sum(p["tris"] for p in parts),
                         "sourceTriangles": len(F),
                         "uvConfinedToOwnSlot": True,
                         "atlasSlotUnique": True,
                         "designRefsAllBound": True},
    }
    bindings = {
        "version": "1.0.0",
        "summary": {"parts": len(parts), "atlasSlots": len(rects),
                    "designRefs": len(ref_records), "textureMaps": 4,
                    "sourcePbrMaps": len(source_pbr),
                    "missing": 0, "misplaced": 0, "duplicated": 0},
        "textureBindings": [{"part": r["part"], "slot": r["slot"],
                             "atlasRectPx": r["px"], "uvRect": [round(x, 6) for x in r["uv"]],
                             "maps": {"basecolor": "textures/atlas_basecolor.png",
                                      "normal": "textures/atlas_normal.png",
                                      "metallicRoughness": "textures/atlas_mr.png",
                                      "emissive": "textures/atlas_emissive.png"}}
                            for r in rects],
        "designRefBindings": ref_records,
        "sourcePbrTextures": source_pbr,
        "invariants": [
            "each triangle belongs to exactly one part (partition is exhaustive and disjoint)",
            "each part owns exactly one atlas slot; no two parts share a slot",
            "every UV coordinate lies inside its own slot with 10px bleeding guard",
            "every one of the 5 supplied design images is bound exactly once by id",
            "every part is covered by at least one design image",
        ],
    }
    open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps(manifest, ensure_ascii=False, indent=2))
    open(os.path.join(args.out, "bindings.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps(bindings, ensure_ascii=False, indent=2))
    print("GLB", glb_size, "JS", js_size, "elapsed", round(time.time() - t0, 1), "s", flush=True)
    print("OUT", args.out, flush=True)


if __name__ == "__main__":
    main()
