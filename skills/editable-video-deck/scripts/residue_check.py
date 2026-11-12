#!/usr/bin/env python3
"""残留样张文字拦截：成品或内容里不许混进版式样张的用法说明，也提醒“请输入／示例／占位”这类占位字。

用法：python3 residue_check.py 成品.html|内容.json [更多…]
- ✗（拦截）：出现内置的通用版式说明句。
  例：“左侧主干＋肘形分支”“3–4条最合适”。这些是模板说明，不是事实内容，出现在成品里就是漏改。
- △（提醒）：出现常见占位字（请输入、示例、占位、Lorem、XXX、待补充、这里是…、[必填]、TODO）。可能是真内容，人工确认。
build_deck.py 构建时自动调用：有 ✗ 就停，有 △ 打印出来。参考：大师 PPT 的 validate:goal-copy。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDERS = ['请输入', '示例', '占位', 'Lorem', 'lorem', 'XXX', 'xxx', '待补充', '这里是', '[必填]', 'TODO', '标题文字', '正文文字']
FIELDS = ('title', 'lead', 'label', 'body', 'tag', 'note')


def gallery_sentences():
    # Small generic instruction fragments; public package carries no private gallery.
    return {'左侧主干＋肘形分支', '每个项目独占一行', '标题文字放在这里', '正文文字放在这里'}


def texts(d):
    """逐字段列出 (位置, 文字)；note 是给主播看的备注，只查占位字不查样张句"""
    for p in d.get('pages', []):
        for k in FIELDS:
            if p.get(k):
                yield f"{p.get('id')}.{k}", str(p[k])
        for g in p.get('groups', []):
            for k in FIELDS:
                if g.get(k):
                    yield f"{g.get('id')}.{k}", str(g[k])


def check(d):
    sent, bad, warn = gallery_sentences(), [], []
    for where, t in texts(d):
        plain = re.sub(r'<[^>]+>', '', t)
        if not where.endswith('.note'):
            for s in sent:
                if s in plain:
                    bad.append(f'{where}：样张说明「{s}」')
        for w in PLACEHOLDERS:
            if w in plain:
                warn.append(f'{where}：「{w}」← {plain[:30]}')
    return bad, warn


def load(path):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    if p.suffix == '.html':
        m = re.search(r'/\*DATA_START\*/\s*let DATA = ([\s\S]*?);\s*/\*DATA_END\*/', s)
        if not m:
            sys.exit(f'{path}：找不到 DATA_START/DATA_END')
        return json.loads(m.group(1))
    d = json.loads(s)
    return {'pages': d} if isinstance(d, list) else d


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    total = 0
    for f in sys.argv[1:]:
        bad, warn = check(load(f))
        print(f"{Path(f).name}：{'✗ 有样张残留 ' + str(len(bad)) + ' 处' if bad else '✓ 无样张残留'}{'，△ 占位字 ' + str(len(warn)) + ' 处' if warn else ''}")
        for x in bad:
            print('  ✗ ' + x)
        for x in warn:
            print('  △ ' + x)
        total += len(bad)
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
