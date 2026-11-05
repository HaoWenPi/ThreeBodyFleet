# -*- coding: utf-8 -*-
"""Build an inline, WebGL-ready ship model JS from a glTF 2.0 binary.

Pipeline:
  1. read POSITION / NORMAL / TEXCOORD_0 / indices from the GLB
  2. bake glTF node rotation (Blender Z-up export) into world Y-up
  3. QEM edge-collapse decimation WITH wedge texture coordinate preservation
  4. split UV seams into an indexed BufferGeometry layout
  5. quantize normals (int8) and UVs (uint16) for a compact payload
  6. downscale 4K PBR textures to WebP and inline everything as base64

Usage:
  python tools/build_ship_model.py --input <model.glb> [--output ship-model.js]
                                   [--faces 150000] [--tex 2048] [--length 76]

Requires: numpy, Pillow, pymeshlab.
"""
import argparse
import base64
import io
import json
import os
import struct
import sys
import time

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def read_glb(path):
    raw = open(path, "rb").read()
    magic, ver, _ = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or ver != 2:
        raise ValueError("not a glTF 2.0 binary: %s" % path)
    jlen, jtyp = struct.unpack_from("<I4s", raw, 12)
    if jtyp != b"JSON":
        raise ValueError("GLB has no JSON chunk")
    js = json.loads(raw[20:20 + jlen].decode("utf-8"))
    bin_off = 20 + jlen + 8
    return raw, js, bin_off


def accessor(raw, js, bin_off, i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    off = bin_off + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return np.frombuffer(raw, dtype=dt, count=a["count"] * n, offset=off).reshape(a["count"], n)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def clean_livery(img, med_k=5, shadow=0.42, slope=0.34, unsharp=55):
    """Flatten dense dirt/speckle noise in the source livery into clean panels.

    The source GLB ships a 4K basecolor map crowded with dark wear speckles and
    tiny greeble marks. Under a metallic PBR material those read as broken shards.
    Remove isolated dark specks (median), lift remaining shadows so marks become
    grey panel lines, then sharpen the surviving larger edges.
    """
    from PIL import ImageFilter
    a = np.asarray(img, dtype=np.float32) / 255.0
    w = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    lum = a @ w
    med = np.asarray(img.filter(ImageFilter.MedianFilter(med_k)), dtype=np.float32) / 255.0
    speck = (lum < 0.34) & ((med @ w) > lum + 0.16)
    a = np.where(speck[:, :, None], med, a)
    lum2 = a @ w
    k = np.where(lum2 < shadow, shadow + (lum2 - shadow) * slope, lum2)
    a = a * (k / np.maximum(lum2, 1e-4))[:, :, None]
    out = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    if unsharp:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.1, percent=unsharp, threshold=3))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", default=None)
    ap.add_argument("--faces", type=int, default=150000)
    ap.add_argument("--tex", type=int, default=2048)
    ap.add_argument("--length", type=float, default=76.0)
    ap.add_argument("--raw-tex", action="store_true",
                    help="keep the source GLB's dark wear speckles instead of cleaning them")
    args = ap.parse_args()

    out_path = args.output or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ship-model.js")
    print("INPUT ", args.input, os.path.getsize(args.input), "bytes", flush=True)
    raw, js, bin_off = read_glb(args.input)

    mesh = js["meshes"][0]
    prim = mesh["primitives"][0]
    attrs = prim["attributes"]
    pos = accessor(raw, js, bin_off, attrs["POSITION"])
    nrm = accessor(raw, js, bin_off, attrs["NORMAL"]) if "NORMAL" in attrs else None
    uv = accessor(raw, js, bin_off, attrs["TEXCOORD_0"])
    tri = accessor(raw, js, bin_off, prim["indices"]).reshape(-1, 3)
    print("SOURCE", "verts", len(pos), "tris", len(tri), flush=True)

    # Blender glTF export applies a +90 deg X rotation on the node.
    # Bake it: world(x,y,z) = (x, -z, y).  Long axis becomes world Z.
    P = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1]], axis=1).astype(np.float64)
    N = np.stack([nrm[:, 0], -nrm[:, 2], nrm[:, 1]], axis=1).astype(np.float64) if nrm is not None else None
    F = tri.astype(np.int32)

    import pymeshlab as pm
    ms = pm.MeshSet()
    # glTF stores UVs per vertex (seams are duplicated vertices), so hand those
    # to MeshLab and convert to per-wedge UVs before the textured decimator.
    kwargs = dict(vertex_matrix=P, face_matrix=F, v_tex_coords_matrix=uv.astype(np.float64))
    if N is not None:
        kwargs["v_normals_matrix"] = N
    ms.add_mesh(pm.Mesh(**kwargs), "ship")
    ms.compute_texcoord_transfer_vertex_to_wedge()
    print("DECIMATE target", args.faces, flush=True)
    t = time.time()
    ms.meshing_decimation_quadric_edge_collapse_with_texture(
        targetfacenum=args.faces, extratcoordw=1.0,
        preserveboundary=False, optimalplacement=True, qualitythr=0.3)
    print("DECIMATE_DONE seconds", round(time.time() - t, 1), flush=True)

    mo = ms.current_mesh()
    P2 = mo.vertex_matrix()
    F2 = mo.face_matrix().astype(np.int64)
    W2 = np.asarray(mo.wedge_tex_coord_matrix())
    if W2.ndim == 2 and W2.shape[1] == 2:
        W2 = W2.reshape(-1, 3, 2)
    W2 = W2.reshape(-1, 2)
    N2 = np.asarray(mo.vertex_normal_matrix())
    if not np.isfinite(N2).all() or np.abs(N2).sum() < 1e-6:
        ms.compute_normal_per_vertex()
        N2 = np.asarray(ms.current_mesh().vertex_normal_matrix())
    print("RESULT", "verts", len(P2), "tris", len(F2), "wedgeUV", W2.shape,
          "normals", N2.shape, flush=True)

    # Split UV seams: one rendered vertex per (simplified vertex, quantized UV).
    vi = F2.reshape(-1).astype(np.uint32)
    uq = np.round(np.clip(W2, 0.0, 1.0) * 65535.0).astype(np.uint16)
    key_dt = np.dtype([("v", "<u4"), ("u", "<u2"), ("w", "<u2")])
    keys = np.empty(len(vi), dtype=key_dt)
    keys["v"], keys["u"], keys["w"] = vi, uq[:, 0], uq[:, 1]
    uniq, inv = np.unique(keys, return_inverse=True)
    src = uniq["v"].astype(np.int64)
    P3 = P2[src]
    N3 = N2[src]
    U3 = np.stack([uniq["u"], uniq["w"]], axis=1).astype(np.float64) / 65535.0
    I3 = inv.astype(np.uint32)
    print("SPLIT", "render verts", len(P3), "indices", len(I3), flush=True)

    # Normalize: centre the bbox, scale longest (Z) axis to the game length.
    lo, hi = P3.min(axis=0), P3.max(axis=0)
    scale = args.length / float(hi[2] - lo[2])
    P3 = (P3 - (lo + hi) * 0.5) * scale
    print("NORMALIZE", "scale", round(scale, 3), "bbox", np.round(lo, 4), np.round(hi, 4), flush=True)

    # Textures: locate by material slot, downscale, encode WebP.
    mat = js["materials"][prim["material"]]
    pbr = mat.get("pbrMetallicRoughness", {})
    slots = {
        "baseColor": pbr.get("baseColorTexture", {}).get("index"),
        "normal": mat.get("normalTexture", {}).get("index"),
        "mr": pbr.get("metallicRoughnessTexture", {}).get("index"),
    }
    quality = {"baseColor": 88, "normal": 92, "mr": 90}
    tex_out = {}
    for name, ti in slots.items():
        if ti is None:
            print("TEX", name, "MISSING", flush=True)
            continue
        src_img = js["images"][js["textures"][ti]["source"]]
        bv = js["bufferViews"][src_img["bufferView"]]
        st = bin_off + bv.get("byteOffset", 0)
        blob = raw[st:st + bv["byteLength"]]
        img = Image.open(io.BytesIO(blob)).convert("RGB")
        if img.width != args.tex or img.height != args.tex:
            img = img.resize((args.tex, args.tex), Image.LANCZOS)
        if name == "baseColor" and not args.raw_tex:
            med_k = max(3, int(round(args.tex / 2048.0 * 5)) | 1)
            img = clean_livery(img, med_k=med_k)
            print("TEX  baseColor cleaned (median %d)" % med_k, flush=True)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality[name], method=5)
        data = buf.getvalue()
        tex_out[name] = "data:image/webp;base64," + base64.b64encode(data).decode("ascii")
        print("TEX", name, "src", src_img.get("name"), "->", args.tex, "webp", len(data), "bytes", flush=True)

    Pq = np.ascontiguousarray(P3, dtype=np.float32)
    Nq = np.clip(np.round(N3 * 127.0), -127, 127).astype(np.int8)
    Uq = np.clip(np.round(U3 * 65535.0), 0, 65535).astype(np.uint16)
    Iq = np.ascontiguousarray(I3, dtype=np.uint32)

    payload = {
        "pos": b64(Pq), "nrm": b64(Nq), "uv": b64(Uq), "idx": b64(Iq),
        "vCount": int(len(Pq)), "iCount": int(len(Iq)),
        "tex": tex_out,
        "meta": {
            "source": os.path.basename(args.input),
            "tris": int(len(F2)),
            "verts": int(len(Pq)),
            "texSize": args.tex,
            "length": args.length,
            "bbox": [round(float(v), 3) for v in (P3.min(axis=0))] + [round(float(v), 3) for v in (P3.max(axis=0))],
        },
    }

    lines = [
        "/* Auto-generated by tools/build_ship_model.py - do not edit by hand.",
        "   Inline, decimated, texture-preserving natural selection ship model.",
        "   Source: %s | %d triangles | %d vertices | %dpx WebP */" %
        (payload["meta"]["source"], payload["meta"]["tris"], payload["meta"]["verts"], args.tex),
        "window.NS_SHIP = {",
        '  vCount: %d, iCount: %d,' % (payload["vCount"], payload["iCount"]),
        '  meta: %s,' % json.dumps(payload["meta"], ensure_ascii=False),
        '  pos: "%s",' % payload["pos"],
        '  nrm: "%s",' % payload["nrm"],
        '  uv: "%s",' % payload["uv"],
        '  idx: "%s",' % payload["idx"],
    ]
    for k, v in tex_out.items():
        lines.append('  %s: "%s",' % (k, v))
    lines.append("};")
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("OUTPUT", out_path, os.path.getsize(out_path), "bytes", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
