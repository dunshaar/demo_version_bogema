#!/usr/bin/env python3
"""Copy/check the shared visual system in the independent client site.

python3 tools/sync-design-system.py --client-root "/absolute/path/to/public" [--check]
Only visual assets are synchronized. Songs, markup, state, forms and transport
are never copied. Run --check before releasing a change to the shared system.
"""
from pathlib import Path
import argparse
import hashlib
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--client-root", required=True, type=Path)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
source = Path(__file__).resolve().parents[1]
target = args.client_root.expanduser().resolve(strict=True)
if not (target / "index.html").is_file() or not (target / "repertoire.js").is_file():
    parser.error("Expected the existing independent client site's public directory")
files = ["assets/bogema-catalog-controls.css", "assets/bogema-navigation.css", "assets/logo.svg", "assets/logo-dark.svg",
         "assets/bogema-design-system.css", "assets/fonts/fonts.css",
         "assets/fonts/manrope-hero-variable.ttf"]
# The static Manrope/Spectral subsets and their licenses must match as well.
files += [str(p.relative_to(source)) for p in (source / "assets/fonts").iterdir()
          if p.suffix == ".woff2" or p.name.startswith("OFL-")]
differences = []
for name in files:
    src, dst = source / name, target / name
    if not args.check:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    if not dst.is_file() or hashlib.sha256(src.read_bytes()).digest() != hashlib.sha256(dst.read_bytes()).digest():
        differences.append(name)
if differences:
    raise SystemExit("Different or missing shared assets: " + ", ".join(differences))
print(f"Shared design system: {len(files)} identical assets")
