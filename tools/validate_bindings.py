# -*- coding: utf-8 -*-
"""Validate the structured ship package: geometry partition, atlas bindings,
design references and source maps. Reads the ACTUAL artifacts (GLB accessors,
PNG headers, image hashes), not just the manifest's own claims.

Usage: python tools/validate_bindings.py [--root <package dir>]
Exit code 0 = all checks pass, 1 = at least one failure.
"""
import argparse
import hashlib
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("  " + str(detail) if detail else ""))


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def read_glb(path):
    raw = open(path, "rb").read()
    magic, ver, total = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF" and ver == 2, "not a glTF 2.0 binary"
    (jlen,) = struct.unpack_from("<I", raw, 12)
    js = json.loads(raw[20:20 + jlen].decode("utf-8"))
    return raw, js, 20 + jlen + 8


def accessor(raw, js, bo, i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    off = bo + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return np.frombuffer(raw, dtype=dt, count=a["count"] * n, offset=off).reshape(a["count"], n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = args.root or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "models", "NaturalSelection-Structured")
    print("PACKAGE", root)
    if not os.path.isdir(root):
        check("package directory exists", False, root)
        return finish()

    mani = json.load(open(os.path.join(root, "manifest.json"), encoding="utf-8"))
    bind = json.load(open(os.path.join(root, "bindings.json"), encoding="utf-8"))
    parts = mani["parts"]
    slots = bind["textureBindings"]
    refs = bind["designRefBindings"]
    src = bind["sourcePbrTextures"]

    # ---------------- structure ----------------
    check("10 semantic parts", len(parts) == 10, len(parts))
    check("part ids unique", len({p["id"] for p in parts}) == len(parts))
    check("slot ids unique", len({s["slot"] for s in slots}) == len(slots))
    check("one slot per part", {p["slot"] for p in parts} == {s["slot"] for s in slots})
    total = sum(p["triangles"] for p in parts)
    check("partition exhaustive", total == mani["source"]["triangles"],
          "%d / %d" % (total, mani["source"]["triangles"]))
    check("all parts have a design reference",
          {p["id"] for p in parts} <= {x for r in refs for x in r["boundParts"]})
    check("5 design refs, unique ids", len(refs) == 5 and len({r["id"] for r in refs}) == 5,
          len(refs))
    check("design ref files present + hash match",
          all(os.path.exists(os.path.join(root, r["file"])) and
              sha(open(os.path.join(root, r["file"]), "rb").read()) == r["sha256"] for r in refs))
    check("binding summary declares 0/0/0",
          all(bind["summary"][k] == 0 for k in ("missing", "misplaced", "duplicated")))

    # ---------------- textures ----------------
    tdir = os.path.join(root, "textures")
    maps = ["atlas_basecolor.png", "atlas_normal.png", "atlas_mr.png", "atlas_emissive.png"]
    sizes = []
    for m in maps:
        p = os.path.join(tdir, m)
        ok = os.path.exists(p)
        if ok:
            with Image.open(p) as im:
                sizes.append(im.size)
        check("atlas " + m, ok, os.path.getsize(p) if ok else "missing")
    check("all atlases 2048x2048", all(s == (2048, 2048) for s in sizes), sizes)
    check("3 source PBR maps preserved", len(src) == 3 and
          all(os.path.exists(os.path.join(root, x["file"])) for x in src), len(src))

    # ---------------- GLB: real geometry + real UVs ----------------
    gp = os.path.join(root, mani["artifacts"]["glb"])
    raw, js, bo = read_glb(gp)
    check("GLB has 10 meshes / 10 materials / 10 nodes",
          len(js["meshes"]) == 10 and len(js["materials"]) == 10 and len(js["nodes"]) == 11,
          "%d/%d/%d" % (len(js["meshes"]), len(js["materials"]), len(js["nodes"])))
    check("GLB has 4 embedded textures", len(js["textures"]) == 4 and len(js["images"]) == 4)
    mat_ids, tris, uv_bad = [], [], []
    for i, mesh in enumerate(js["meshes"]):
        pr = mesh["primitives"][0]
        mat_ids.append(pr["material"])
        idx = accessor(raw, js, bo, pr["indices"])
        tris.append(len(idx) // 3)
        uv = accessor(raw, js, bo, pr["attributes"]["TEXCOORD_0"])
        r = slots[i]["uvRect"]
        if not (uv[:, 0].min() >= r[0] - 1e-5 and uv[:, 0].max() <= r[2] + 1e-5 and
                uv[:, 1].min() >= r[1] - 1e-5 and uv[:, 1].max() <= r[3] + 1e-5):
            uv_bad.append(mesh["name"])
    check("GLB triangle total matches STL", sum(tris) == mani["source"]["triangles"],
          "%d / %d" % (sum(tris), mani["source"]["triangles"]))
    check("each GLB mesh uses its own material", len(set(mat_ids)) == 10, mat_ids)
    check("every real UV stays in its own slot", not uv_bad, uv_bad)

    # ---------------- inline JS ----------------
    jp = os.path.join(root, mani["artifacts"]["inlineJS"])
    txt = open(jp, encoding="utf-8").read()
    check("inline JS declares window.NS_STRUCTURED", txt.startswith("window.NS_STRUCTURED = "))
    check("inline JS embeds 4 data-URI maps", txt.count("data:image/png;base64,") == 4)
    return finish()


def finish():
    bad = [c for c in CHECKS if not c[1]]
    print("\nRESULT", "PASS" if not bad else "FAIL",
          "checks=%d failed=%d" % (len(CHECKS), len(bad)))
    if bad:
        print("FAILED:", ", ".join(c[0] for c in bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
