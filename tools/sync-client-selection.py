#!/usr/bin/env python3
"""Synchronize the standalone client page into the Pages selection/ directory."""
from pathlib import Path
import argparse,hashlib,shutil
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--client-root',required=True,type=Path)
parser.add_argument('--check',action='store_true')
args=parser.parse_args()
source=args.client_root.expanduser().resolve(strict=True)
target=Path(__file__).resolve().parents[1]/'selection'
if source==target.resolve():
    parser.error('Use the independent client source, not the generated selection folder')
files=['index.html','repertoire.js','repertoire.css','client-finishing.css','data.json','catalog-categories.json','forms-config.json','forms.css','forms.js','motion.css','motion.js','phone-input.mjs','preferences-store.mjs','request-contract.mjs','robots.txt','styles.css']
files += [str(p.relative_to(source)) for p in (source/'assets').rglob('*') if p.is_file() and p.suffix.lower() in {'.css','.svg','.jpg','.jpeg','.png','.webp','.woff2','.ttf','.txt'}]
if any(not (source/name).is_file() or (source/name).is_symlink() for name in files):
    parser.error('A required source file is missing or is a symlink')
extra={str(p.relative_to(target)) for p in target.rglob('*') if p.is_file()}-set(files)
if extra:parser.error('Unexpected target files; review them before syncing: '+', '.join(sorted(extra)))
different=[]
for name in files:
    src,dst=source/name,target/name
    if not args.check:
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,dst)
    if not dst.is_file() or hashlib.sha256(src.read_bytes()).digest()!=hashlib.sha256(dst.read_bytes()).digest():
        different.append(name)
if different:raise SystemExit('Selection differs: '+', '.join(different))
print(f'Selection: {len(files)} identical website files')
