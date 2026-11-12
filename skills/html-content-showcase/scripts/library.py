#!/usr/bin/env python3
"""Local, shared usage ledger. Python standard library only."""
import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(os.environ.get("HTML_SHOWCASE_ROOT", Path(__file__).resolve().parents[1] / "library"))


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def connect(root):
    (root / 'state').mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(root / 'state/usage.sqlite3', timeout=20)
    db.row_factory = sqlite3.Row
    db.executescript('''
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, pattern TEXT NOT NULL, kind TEXT NOT NULL,
      project TEXT NOT NULL, artifact TEXT NOT NULL, sha256 TEXT NOT NULL,
      note TEXT NOT NULL, at TEXT NOT NULL,
      UNIQUE(pattern,kind,project,artifact,sha256));
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY, pattern TEXT NOT NULL, at TEXT NOT NULL);
    ''')
    return db


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=ROOT, help='Template library root; also configurable via HTML_SHOWCASE_ROOT')
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list')
    rec = sub.add_parser('record')
    rec.add_argument('--pattern', required=True)
    rec.add_argument('--kind', choices=['trial', 'delivered', 'accepted'], required=True)
    rec.add_argument('--project', required=True)
    rec.add_argument('--artifact', type=Path, required=True)
    rec.add_argument('--note', required=True)
    sub.add_parser('review')
    notice = sub.add_parser('notice')
    notice.add_argument('--pattern', required=True)
    args = p.parse_args()
    root = args.root.resolve()
    try:
        catalog = json.loads((root / 'catalog.json').read_text(encoding='utf8'))
        items = catalog['patterns']
        if not isinstance(items,list) or any(not isinstance(x,dict) or not isinstance(x.get('id'),str) or not x['id'] or not isinstance(x.get('name'),str) for x in items):
            raise ValueError('patterns require nonempty id and name')
        patterns = {x['id']: x for x in items}
        if len(patterns) != len(items): raise ValueError('duplicate pattern id')
    except (OSError,ValueError,KeyError,TypeError) as e:
        p.error('Invalid catalog: '+str(e))
    if hasattr(args, 'pattern') and args.pattern not in patterns:
        p.error('Unknown pattern; choose an id from list')
    if args.cmd == 'list':
        print(json.dumps(catalog, ensure_ascii=False, indent=2))
        return
    # Reject invalid evidence before opening/creating the ledger.
    if args.cmd == 'record':
        artifact = args.artifact.expanduser().resolve()
        if not artifact.is_file():
            p.error('Artifact must be an existing file')
        if not args.project.strip() or not args.note.strip():
            p.error('Project and evidence note must not be empty')
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    with connect(root) as db:
        if args.cmd == 'record':
            cur = db.execute('INSERT OR IGNORE INTO events(pattern,kind,project,artifact,sha256,note,at) VALUES(?,?,?,?,?,?,?)',
                             (args.pattern,args.kind,args.project.strip(),str(artifact),digest,args.note,now()))
            result = {'inserted': bool(cur.rowcount), 'pattern':args.pattern, 'kind':args.kind, 'sha256':digest}
        elif args.cmd == 'notice':
            db.execute('INSERT INTO notices(pattern,at) VALUES(?,?)', (args.pattern,now()))
            result = {'notice_recorded':args.pattern}
        else:
            today = datetime.now(timezone.utc)
            cut90 = (today-timedelta(days=90)).isoformat()
            cut30 = (today-timedelta(days=30)).isoformat()
            cut14 = (today-timedelta(days=14)).isoformat()
            stats = []
            for key, item in patterns.items():
                n90 = db.execute("SELECT COUNT(DISTINCT project) FROM events WHERE pattern=? AND kind IN ('delivered','accepted') AND at>=?", (key,cut90)).fetchone()[0]
                n30 = db.execute("SELECT COUNT(DISTINCT project) FROM events WHERE pattern=? AND kind IN ('delivered','accepted') AND at>=?", (key,cut30)).fetchone()[0]
                trials = db.execute("SELECT COUNT(*) FROM events WHERE pattern=? AND kind='trial'", (key,)).fetchone()[0]
                last = db.execute('SELECT MAX(at) FROM notices WHERE pattern=?', (key,)).fetchone()[0]
                stats.append({'id':key,'name':item['name'],'projects90':n90,'projects30':n30,'trials':trials,'last_notice':last})
            unused = [s for s in stats if not s['projects30'] and (not s['last_notice'] or s['last_notice']<cut14)]
            unused.sort(key=lambda s:(-bool(s['trials']),s['last_notice'] or '',s['id']))
            result = {'at':now(),'coverage':'Only registered events; absence is not proof of non-use.',
                      'popular':[s for s in stats if s['projects90']>=3],
                      'try_next':unused[:2], 'stats':stats}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
