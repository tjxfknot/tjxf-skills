#!/usr/bin/env python3
"""Install only selected skill folders. Never overwrite an existing skill."""
import argparse
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--list', action='store_true', help='list available skills without writing')
    parser.add_argument('--skill', action='append', default=[], help='exact skill folder name; repeatable')
    parser.add_argument('--target', type=Path, help='your assistant skill directory')
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / 'skills'
    available = {p.name: p for p in source.iterdir() if p.is_dir() and (p/'SKILL.md').is_file()}
    if args.list:
        print('\n'.join(sorted(available)))
        return
    if not args.skill or args.target is None:
        parser.error('use --list, or provide --skill NAME and --target DIRECTORY')
    if any(name not in available for name in args.skill):
        parser.error('unknown skill name')
    if len(args.skill) != len(set(args.skill)):
        parser.error('duplicate skill selection')
    target = args.target.expanduser().resolve()
    destinations = [target/name for name in args.skill]
    if any(p.exists() or p.is_symlink() for p in destinations):
        parser.error('a selected skill already exists; no files were copied')
    target.mkdir(parents=True, exist_ok=True)
    for name, dest in zip(args.skill, destinations):
        shutil.copytree(available[name], dest)
        print(f'Installed {name}: {dest}')


if __name__ == '__main__':
    main()
