#!/usr/bin/env python3
"""Validate local learning-card JSON; no network or writes."""
import argparse
import datetime
import json
from pathlib import Path

def validate(data):
    if not isinstance(data, dict) or not isinstance(data.get('holes'), list) or not isinstance(data.get('terms'), list):
        raise ValueError('root requires holes and terms arrays')
    ids, links = set(), []
    for hole in data['holes']:
        datetime.date.fromisoformat(hole['added'])
        if not isinstance(hole['mouth'], str) or not hole['mouth'].strip():
            raise ValueError('mouth must be nonempty')
        cards = hole['cards']
        if not isinstance(cards, list) or not cards or sum(c.get('root') is True for c in cards) != 1:
            raise ValueError('each hole requires exactly one root card')
        for c in cards:
            if not isinstance(c['id'], str) or not c['id'] or c['id'] in ids:
                raise ValueError('card ids must be unique nonempty strings')
            ids.add(c['id'])
            if not isinstance(c['t'], str) or not c['t'].strip():
                raise ValueError('card title must be nonempty')
            if c.get('root'):
                if c['d'] != 1 or any(not isinstance(c.get(k), str) or not c[k].strip() for k in ('gap','coord','next')):
                    raise ValueError('root needs d=1, gap, coord, next')
            elif c['d'] != 2 or not isinstance(c.get('body'), list) or not c['body'] or any(not isinstance(x,list) or len(x)!=2 or not all(isinstance(y,str) for y in x) for x in c['body']):
                raise ValueError('detail needs d=2 and [heading, text] pairs')
            if not isinstance(c.get('links'), list) or not all(isinstance(x,str) for x in c['links']):
                raise ValueError('links must be string array')
            links += c['links']
    if set(links)-ids:
        raise ValueError('unknown card links: '+', '.join(sorted(set(links)-ids)))
    term_ids=set()
    for term in data['terms']:
        if not isinstance(term['id'],str) or not term['id'] or term['id'] in term_ids:
            raise ValueError('term ids must be unique nonempty strings')
        term_ids.add(term['id'])
        if any(not isinstance(term.get(k),str) or not term[k].strip() for k in ('term','explain','search')):
            raise ValueError('term needs term, explain, search')
        datetime.date.fromisoformat(term['added'])
        if not isinstance(term.get('match'),list) or not term['match'] or not all(isinstance(x,str) and x for x in term['match']):
            raise ValueError('term match must be nonempty string array')
        if term.get('card') is not None and term['card'] not in ids:
            raise ValueError('term references unknown card')
    return len(ids),len(term_ids)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('file',type=Path);a=p.parse_args()
    try: n,t=validate(json.loads(a.file.read_text(encoding='utf8')))
    except (OSError,ValueError,KeyError,TypeError) as e: p.exit(1,'Invalid: '+str(e)+'\n')
    print(f'Valid local JSON: {n} cards, {t} terms. No sync performed.')
if __name__=='__main__': main()
