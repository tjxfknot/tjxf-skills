#!/usr/bin/env python3
"""Check the public package locally without invoking any external service."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def main():
    errors = []
    identity = json.loads((ROOT/'public-identity.json').read_text())
    own_copyright = f"Copyright (c) 2026 {identity['copyrightName']}"
    if own_copyright not in (ROOT/'LICENSE').read_text():
        errors.append('own copyright does not match public identity')
    counts = {'skills': 0, 'python': 0, 'json': 0, 'javascript': 0, 'markdown_links': 0}
    catalog = json.loads((ROOT/'catalog.json').read_text())
    names = {item['name'] for item in catalog['skills']}
    actual = {p.name for p in (ROOT/'skills').iterdir() if p.is_dir()}
    authorized = set(json.loads((ROOT/'publication.json').read_text())['authorizedSkillNames'])
    if names != authorized or actual != names:
        errors.append('skill folders differ from the explicitly authorized publication set')
    for name in names:
        path = ROOT/'skills'/name/'SKILL.md'
        if not path.is_file():
            errors.append(f'missing entrypoint: {name}')
            continue
        text = path.read_text()
        front = re.match(r'\A---\n(.*?)\n---\n', text, re.S)
        if not front or not re.search(r'^name:\s*\S', front[1], re.M) or not re.search(r'^description:\s*\S', front[1], re.M):
            errors.append(f'invalid required frontmatter: {name}')
        counts['skills'] += 1

    private = re.compile(r'/Users/[A-Za-z0-9_.-]+/|/home/(?!user(?:/|$))[A-Za-z0-9_.-]+/|my\.feishu\.cn/(?:docx|wiki|base)/[A-Za-z0-9]{10,}|claude\.ai/artifact/[A-Za-z0-9]{10,}')
    credentials = re.compile(r'gh[pousr]_[A-Za-z0-9_]{24,}|sk-[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
    files = []
    for path in sorted(ROOT.rglob('*')):
        relative = path.relative_to(ROOT)
        if any(part in {'.git', '__pycache__', 'node_modules', '.venv'} for part in relative.parts):
            continue
        if path.is_symlink():
            errors.append(f'symlink not permitted in public package: {relative}')
            continue
        if not path.is_file():
            continue
        files.append(path)
        if path.stat().st_size > 5_000_000:
            errors.append(f'unreviewed large asset: {relative}')
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            errors.append(f'unreviewed binary asset: {relative}')
            continue
        if private.search(text) or credentials.search(text):
            errors.append(f'possible private data: {relative}')
        try:
            if path.suffix == '.py':
                ast.parse(text)
                counts['python'] += 1
            elif path.suffix == '.json':
                json.loads(text)
                counts['json'] += 1
            elif path.suffix in {'.js', '.cjs', '.mjs'}:
                result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
                if result.returncode:
                    errors.append(f'JavaScript syntax: {relative}')
                counts['javascript'] += 1
            if path.suffix == '.md':
                for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
                    if re.match(r'https?://|mailto:|#', target):
                        continue
                    counts['markdown_links'] += 1
                    if not (path.parent/target.split('#')[0]).exists():
                        errors.append(f'broken relative link: {relative} -> {target}')
        except (SyntaxError, ValueError, OSError) as exc:
            errors.append(f'parse check: {relative}: {exc}')

    for name in sorted(names.intersection({'editable-video-deck', 'editable-video-deck-beta'})):
        skill = ROOT/'skills'/name
        if 'Copyright (c) 2016 mozillazg' not in (skill/'LICENSE.pinyin-data').read_text():
            errors.append(f'missing pinyin attribution: {name}')
        for relative in ['assets/engine/pinyin.js', 'assets/examples/demo/demo.html']:
            text = (skill/relative).read_text()
            if 'Permission is hereby granted' not in text or 'Copyright (c) 2016 mozillazg' not in text:
                errors.append(f'incomplete inline pinyin license: {name}/{relative}')
    if '日常分工' in names and not (ROOT/'skills/日常分工/LICENSE.upstream').is_file():
        errors.append('missing upstream license for derived workflow')

    manifest = ROOT/'SHA256SUMS'
    if manifest.is_file():
        expected = {}
        for line in manifest.read_text().splitlines():
            digest, relative = line.split('  ', 1)
            expected[relative] = digest
        current = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p != manifest}
        if current != expected:
            errors.append('SHA256SUMS does not match the package file set and content')
    else:
        errors.append('missing SHA256SUMS release manifest')
    print(json.dumps({'ok': not errors, 'counts': counts, 'files': len(files), 'errors': errors}, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
