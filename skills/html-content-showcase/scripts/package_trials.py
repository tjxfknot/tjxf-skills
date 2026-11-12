#!/usr/bin/env python3
"""Bundle an explicit local file allowlist; no downloads and no third-party bundle supplied."""
import argparse
import json
from pathlib import Path
import zipfile

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',required=True,type=Path)
    p.add_argument('--manifest',required=True,type=Path,help='JSON with files array and license_reviewed=true')
    p.add_argument('--out',required=True,type=Path)
    a=p.parse_args(); root=a.root.resolve()
    try:
        spec=json.loads(a.manifest.read_text(encoding='utf8'))
        if spec.get('license_reviewed') is not True: raise ValueError('Review redistribution rights before bundling')
        names=spec['files']
        if not isinstance(names,list) or not names or not all(isinstance(n,str) for n in names): raise ValueError('files must be nonempty string array')
        selected=[]
        for name in names:
            rel=Path(name)
            if rel.is_absolute() or '..' in rel.parts: raise ValueError('Unsafe path: '+name)
            f=(root/rel).resolve()
            if not f.is_relative_to(root) or not f.is_file(): raise ValueError('Missing or escaped file: '+name)
            if f==a.out.resolve(): raise ValueError('Output cannot be an input')
            selected.append((f,rel.as_posix()))
    except (OSError,ValueError,KeyError,TypeError) as e: p.error(str(e))
    a.out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(a.out,'x',zipfile.ZIP_DEFLATED) as z:
        for f,n in selected: z.write(f,n)
    print(a.out)
if __name__=='__main__': main()
