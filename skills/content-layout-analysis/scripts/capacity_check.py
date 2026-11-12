#!/usr/bin/env python3
"""版式容量预估（内容呈现分析用，出 HTML 之前的粗筛）

用法：python3 capacity_check.py 规划.json 内容.json [--json]

按 1600×1200 画布、editable-video-deck 0.3.0 引擎的实际尺寸，逐页估算每张卡的行数与高度，
标出：可能溢出（卡底 > 1120）、标题超过 2 行、说明行太多、落在人物框区的卡被收窄后变高、孤字行风险。
常数用通用 18 页实测校准（2026-09-28，见 references/capacity.md）。这是估算，定稿以
editable-video-deck/scripts/checks/probe-size.cjs 与 verify.cjs 的浏览器实测为准。
"""
import json, math, re, sys
from pathlib import Path

CANVAS_BOTTOM = 1120       # 安全底线：人物框区下沿，也是 verify 的溢出判据附近
PORTRAIT_TOP = 780         # 右下人物框 x1140–1484、y780–1120；进入此高度的单列卡收窄到 1072-缩进
PORTRAIT_W = 1072
GROUPS_TOP = 276           # 一行页标题（72px）时卡片起点；每多一行标题 +85，lead 每行 +39（28px×1.4）+16
TITLE_LINE = 85
PAD_V, PAD_H = 28, 48      # 卡片上下/左右内边距合计
LAYOUT_DEFAULT_LABELW = 180
SEP = '、／，；：＋。）｜ '
SPARSE_BOTTOM = 600         # 估计卡底高于这条线＝下半部大片空着
# 节奏规则（2026-10-06，参考歸藏的节奏规定按口播课件改）：同一版式连用不超过 3 页；8 页以上至少 4 种版式；
# 7 张卡以上的密集页不连着放两页以上
RUN_MAX, VARIETY_MIN_PAGES, VARIETY_MIN, DENSE_CARDS, DENSE_RUN = 3, 8, 4, 7, 2


def text_w(s, size):
    """估算一行文字宽度：汉字与全角标点=1em，数字/拉丁≈0.58em，空格≈0.3em"""
    w = 0.0
    for ch in s:
        if ch in '\u2060\u200b':  # 不可断连接符／零宽空格：不占宽度
            continue
        if ch == ' ':
            w += .3
        elif ord(ch) < 0x2E80:
            w += .58
        else:
            w += 1
    return w * size


def lines(s, size, width):
    """按词组边界断行估算行数（引擎只在 、／＋；等之后断）；返回 (行数, 最后一行字数)"""
    total, last = 0, 0
    for para in [x for x in str(s or '').split('\n') if x.strip()]:
        para = re.sub(r'<[^>]+>', '', para).replace('【待核】', '待核｜')
        chunks = re.findall(r'[^' + re.escape(SEP) + r']*[' + re.escape(SEP) + r']?', para)
        chunks = [c for c in chunks if c]
        n, cur = 1, 0.0
        cur_txt = ''
        for c in chunks:
            cw = text_w(c, size)
            if cur and cur + cw > width:
                n += 1; cur = 0.0; cur_txt = ''
            if cw > width:  # 单个词组比行还长，只能在词中断（overflow-wrap:anywhere）
                n += math.ceil(cw / width) - 1
                cw = cw % width
            cur += cw; cur_txt += c
        total += n
        last = len(cur_txt.strip())
    return total, last


def estimate_page(p, cfg, base):
    lay = cfg['layout']
    d = {**base, **cfg.get('design', {})}
    W = d.get('width', 1472)
    card, body, gap = d.get('cardSize', 60), d.get('bodySize', 44), d.get('gap', 20)
    title_size = d.get('titleSize', 72)
    opts = cfg.get('opts', {})
    lw = opts.get('labelw', LAYOUT_DEFAULT_LABELW)
    tl, _ = lines(p.get('title', ''), title_size, W)
    top = GROUPS_TOP + (tl - 1) * TITLE_LINE
    if p.get('lead'):
        top += lines(p['lead'], 28, W)[0] * 39 + 16
    groups = p['groups']
    notes, cards = [], []

    def card_h(g, width, indent=0, label_col=False, label_line=True, pv=PAD_V, ph=PAD_H, mt=8, show_label=True, show_body=True):
        inner = width - ph - (lw + 28 if label_col else 0)
        t, tlast = lines(g.get('title', ''), card, inner)
        b, blast = lines(g.get('body', ''), body, inner) if g.get('body') and show_body else (0, 0)
        h = pv + t * card * 1.2 + mt + b * body * 1.4
        if g.get('pic'):  # 卡片配图（0.3.9）：图框高度写定，上边距 14
            h += 14 + max(120, min(900, int(g['pic'].get('h', 480))))
        if label_line and not label_col and g.get('label') and show_label:
            h += body * .73 * 1.3 + mt - 2
        flags = []
        if t > 2: flags.append(f'标题{t}行')
        if b > 5: flags.append(f'说明{b}行')
        if 0 < blast <= 2 and b > 1: flags.append('说明末行孤字')
        if 0 < tlast <= 2 and t > 1: flags.append('标题末行孤字')
        return h, t, b, flags

    def chip_items(text):
        t = str(text or '')
        if '\n' in t:
            return [x.strip() for x in t.split('\n') if x.strip()]
        out, d, cur = [], 0, ''
        for ch in t:
            if ch in '（(': d += 1
            if ch in '）)': d = max(0, d - 1)
            if ch == '、' and not d:
                out.append(cur); cur = ''
            else:
                cur += ch
        out.append(cur)
        return [x.strip() for x in out if x.strip()]

    def chip_rows(text, size, inner):
        """标签块（0.4.0）：每个标签宽＝字宽＋左右各 .55em，标签间距 .3em；按行装箱"""
        rows, cur = 0, 0.0
        for it in chip_items(text):
            w = min(text_w(it, size) + 1.1 * size, inner)
            if cur and cur + .3 * size + w > inner:
                rows += 1; cur = 0.0
            cur += (.3 * size if cur else 0) + w
        return rows + (1 if cur else 0)

    def chip_card_h(g, width, show_label=True):
        inner = width - PAD_H
        t = lines(g.get('title', ''), card, inner)[0]
        r = chip_rows(g.get('body', ''), body, inner) if g.get('body') else 0
        h = PAD_V + t * card * 1.2 + 8 + r * body * 1.81
        if g.get('label') and show_label:
            h += body * .73 * 1.3 + 6
        return h, t, r, ([f'标签{r}行'] if r > 6 else [])

    if lay == 'htree':  # 横向树：左列根节点，右列分支（进人物框区的分支收窄到 1072-根宽-112）
        rw = opts.get('rootw', 360)
        cw = W - rw - 112
        root = groups[0] if groups else {}
        rh = PAD_V + lines(root.get('title', ''), card * 1.1, rw - PAD_H - 8)[0] * card * 1.1 * 1.15 + 8 + \
             lines(root.get('body', ''), body, rw - PAD_H - 8)[0] * body * 1.4 + (body * .73 * 1.3 + 6 if root.get('label') else 0)
        cards.append((root.get('id', ''), rw, round(rh), 0, 0, []))
        y = top
        for g in groups[1:]:
            fn = (lambda gg, ww: chip_card_h(gg, ww)) if opts.get('chips') else (lambda gg, ww: card_h(gg, ww, label_line=True))
            h, t, b, fl = fn(g, cw)
            if y + h > PORTRAIT_TOP and W > PORTRAIT_W:
                h2, t, b, fl = fn(g, PORTRAIT_W - rw - 112)
                if h2 > h + 1: fl = fl + ['进人物框区收窄后变高']
                h = h2
            cards.append((g['id'], round(cw), round(h), t, b, fl))
            y += h + gap
        bottom = max(top + rh, y - gap)
    elif lay == 'chips':  # 标签块：opts.cols 分列（maxWidth 限宽），每张卡一组
        cols = opts.get('cols', 1)
        span = min(W, opts.get('maxWidth', W))
        cw = (span - gap * (cols - 1)) / cols
        cells = cfg.get('cells') or []
        heights = []
        for i, g in enumerate(groups):
            h, t, r, fl = chip_card_h(g, cw)
            heights.append(h); cards.append((g['id'], round(cw), round(h), t, r, fl))
        row_h = {}
        for i, h in enumerate(heights):
            rr = cells[i][1] if i < len(cells) else i // cols + 1
            row_h[rr] = max(row_h.get(rr, 0), h)
        if cols == 1:  # 单列：骨架会把进人物框区的卡收窄
            y = top
            for i, g in enumerate(groups):
                h = heights[i]
                if y + h > PORTRAIT_TOP and span > PORTRAIT_W:
                    h = chip_card_h(g, PORTRAIT_W)[0]
                y += h + gap
            bottom = y - gap
        else:
            bottom = top + sum(row_h.values()) + gap * (len(row_h) - 1)
            if bottom > PORTRAIT_TOP and span > PORTRAIT_W:
                notes.append('多列标签块底部进入人物框区：maxWidth≤1072，或把短卡放最右列（卡片顶对齐）')
    elif lay == 'podium':  # 领奖台：三块台子 2-1-3，台高 podh（默认560）＋台面线；第四张放右侧
        ph, pw = opts.get('podh', 560), opts.get('podw', 330)
        for i, g in enumerate(groups[:3]):
            need = PAD_V + card * 1.7 + 10 + lines(g.get('title', ''), card, pw - PAD_H)[0] * card * 1.2 + \
                   (chip_rows(g.get("body", ""), body, pw - PAD_H) * body * 1.81 if opts.get('chips') else lines(g.get('body', ''), body, pw - PAD_H)[0] * body * 1.4) + \
                   (body * .73 * 1.3 + 6 if g.get('label') else 0)
            avail = ph * (1, .78, .6)[i]
            cards.append((g['id'], pw, round(max(need, avail)), 0, 0, ['台子装不下，会把台撑高'] if need > avail else []))
        bottom = top + ph + 6
    elif lay in ('rows', 'tree', 'steps', 'proj', 'college'):
        indent = {'tree': 60, 'steps': 76}.get(lay, 0)
        y = top
        for i, g in enumerate(groups):
            width = W - indent
            if lay == 'tree' and opts.get('root') and i == 0:
                width = W
            label_col = lay in ('rows', 'tree', 'steps')
            if lay == 'college':  # 学院名大字＋全称小字一行，专业列表走正文字号
                inner = width - PAD_H
                lab = lines(g.get('label', ''), card, inner)[0]
                lst, llast = lines(g.get('title', ''), body, inner)
                h, t, b, fl = PAD_V + lab * card * 1.2 + 6 + lst * body * 1.4, lab, lst, []
                if 0 < llast <= 2 and lst > 1: fl.append('列表末行孤字')
            elif lay == 'tree' and opts.get('root') and i == 0:  # 母卡：标签、标题、说明排成一行
                h, t, b, fl = PAD_V + card * 1.2, 1, 0, []
            elif lay == 'proj':
                h, t, b, fl = card_h(g, width, label_line=False)
            else:
                h, t, b, fl = card_h(g, width, indent, label_col=label_col)
            if y + h > PORTRAIT_TOP and width > PORTRAIT_W - indent:
                width = PORTRAIT_W - indent
                if lay == 'college':
                    inner = width - PAD_H
                    lab = lines(g.get('label', ''), card, inner)[0]; lst = lines(g.get('title', ''), body, inner)[0]
                    h2 = PAD_V + lab * card * 1.2 + 6 + lst * body * 1.4
                else:
                    h2, t, b, fl = card_h(g, width, indent, label_col=label_col, label_line=lay != 'proj')
                if h2 > h + 1: fl.append('进人物框区收窄后变高')
                h = h2
            cards.append((g['id'], round(width), round(h), t, b, fl))
            y += h + gap + (4 if lay == 'steps' else 0)
        bottom = y - gap
    else:
        cols = {'flow': 3, 'grid2': 2, 'fork': 2, 'sum': 2, 'bh': opts.get('cols', 2), 'master': 1}[lay]
        span = min(W, opts.get('maxWidth', W)) if lay == 'bh' else W
        cgap = 44 if lay == 'flow' else (28 if lay == 'sum' else gap)
        cw = (span - cgap * (cols - 1)) / cols if lay != 'master' else 540
        if lay == 'fork': top += 36
        widths = [cw] * len(groups)
        if lay == 'flow':  # 三栏宽度比 1.12 : 1 : 1.07
            k = (span - cgap * 2) / 3.19
            widths = [k * r for r in (1.12, 1, 1.07)] + [cw] * max(0, len(groups) - 3)
        cells = cfg.get('cells') or []
        prev_in_col = {}
        heights = []
        for i, g in enumerate(groups):
            cw = widths[i]
            if lay == 'sum':
                inner = cw - 60
                t, _ = lines((g.get('title', '') + g.get('label', '')), card * 1.33, inner)
                b, _ = lines(g.get('body', ''), body, inner)
                h, fl = 48 + t * card * 1.33 * 1.2 + b * body * 1.4, []
            elif lay == 'master':
                t, _ = lines(g.get('title', ''), card, cw - PAD_H)
                h, b, fl = 28 + t * card * 1.2 + (body * .73 * 1.3 + 6 if g.get('label') else 0) + 8, 0, []
                pb = lines(g.get('body', ''), body, W - 610 - 60)[0]
                if top + 60 + pb * body * 1.4 > CANVAS_BOTTOM: fl.append(f'详情面板{pb}行可能超底')
            elif lay == 'fork':
                h, t, b, fl = card_h(g, cw, pv=60, ph=56)
            elif lay == 'bh':  # 同一列里与上一张相同的标签/说明不显示；compact 内边距 12/18、间距 2
                c = cells[i][0] if i < len(cells) else (i % cols) + 1
                order = sorted([(cells[j][1] if j < len(cells) else j // cols + 1, j) for j in range(len(groups)) if (cells[j][0] if j < len(cells) else (j % cols) + 1) == c])
                pos = [j for _, j in order].index(i)
                pr = groups[order[pos - 1][1]] if pos else {}
                kw = dict(pv=24, ph=36, mt=2) if opts.get('compact') else {}
                h, t, b, fl = card_h(g, cw, show_label=not (pr and pr.get('label') == g.get('label')), show_body=not (pr and pr.get('body') == g.get('body')), **kw)
            else:
                h, t, b, fl = card_h(g, cw)
            heights.append(h)
            cards.append((g['id'], round(cw), round(h), t, b, fl))
        rows = [max(heights[i:i + cols]) for i in range(0, len(heights), cols)] if lay != 'bh' else None
        if lay == 'bh':  # 网格行高由同一行里最高的卡决定（cells 指定格子，否则按顺序填）
            row_h = {}
            for i, h in enumerate(heights):
                r = cells[i][1] if i < len(cells) else i // cols + 1
                row_h[r] = max(row_h.get(r, 0), h)
            bottom = top + sum(row_h.values()) + gap * (len(row_h) - 1)
        elif lay == 'master':
            bottom = top + sum(heights) + 16 * (len(heights) - 1)
        else:
            bottom = top + sum(rows) + gap * (len(rows) - 1)
        if lay in ('grid2', 'fork', 'sum', 'flow') and bottom > PORTRAIT_TOP and span > PORTRAIT_W:
            notes.append('多列卡片底部进入人物框区：考虑 design.width≤1072 或减行')
    over = bottom > CANVAS_BOTTOM
    if not over and bottom < SPARSE_BOTTOM and len(groups) >= 2:
        notes.append(f'下半部空（卡底约{round(bottom)}）：可调大重点/说明字号或间距（重点最大 72），全宽卡底仍须在 y{PORTRAIT_TOP} 以上')
    if not over and bottom > CANVAS_BOTTOM - 40:
        notes.append('临界：离底线不到40px，估算误差可能翻转，务必实测')
    return {'id': p['id'], 'layout': lay, 'bodySize': body, 'titleLines': tl, 'bottom': round(bottom),
            'overflow': over, 'cards': cards, 'notes': notes}


def rhythm(res, pages):
    """整套节奏：同版式连用、版式种类、密集页扎堆。只提示，不判失败"""
    out, ok = [], [r for r in res if 'layout' in r]
    run = 1
    for i in range(1, len(ok) + 1):
        if i < len(ok) and ok[i]['layout'] == ok[i - 1]['layout']:
            run += 1; continue
        if run > RUN_MAX:
            out.append(f"{ok[i - run]['id']}–{ok[i - 1]['id']} 连续 {run} 页都是 {ok[i - 1]['layout']}：中间换一种版式，或把其中一页做成总览/汇总")
        run = 1
    kinds = {r['layout'] for r in ok}
    if len(ok) >= VARIETY_MIN_PAGES and len(kinds) < VARIETY_MIN:
        out.append(f"{len(ok)} 页只用了 {len(kinds)} 种版式（{'、'.join(sorted(kinds))}）：建议至少 {VARIETY_MIN} 种，按内容关系换")
    n = {p['id']: len(p.get('groups', [])) for p in pages}
    dense = 0
    for i, r in enumerate(ok + [None]):
        if r and n.get(r['id'], 0) >= DENSE_CARDS:
            dense += 1; continue
        if dense >= DENSE_RUN:
            out.append(f"{ok[i - dense]['id']}–{ok[i - 1]['id']} 连着 {dense} 页都是 {DENSE_CARDS} 张卡以上的密集清单：观众喘不过气，拆页或中间插一页汇总")
        dense = 0
    return out


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    plan = json.loads(Path(sys.argv[1]).read_text())
    content = json.loads(Path(sys.argv[2]).read_text())
    pages = content['pages'] if isinstance(content, dict) else content
    base = plan.get('defaults', {}).get('design', {})
    G = {g['id']: g for q in pages for g in q['groups']} | {q['id']: q for q in pages}
    for f in plan.get('textFixes', []):  # 按规划里的文字修正估算（不断言，断言在 build_deck.py）
        t = G.get(f['id'])
        if t is not None:
            t[f['key']] = f['new'] if 'new' in f else str(t.get(f['key'], '')).replace(f['find'], f['replace'])
    res = []
    for p in pages:
        cfg = plan['pages'].get(p['id'])
        if not cfg:
            res.append({'id': p['id'], 'error': '规划里没有这一页'}); continue
        res.append(estimate_page(p, cfg, base))
    if '--json' in sys.argv:
        print(json.dumps(res, ensure_ascii=False, indent=1)); return
    bad = 0
    for r in res:
        if 'error' in r:
            print(r['id'], '✗', r['error']); bad += 1; continue
        flags = [f"{c[0]}:{'/'.join(c[5])}" for c in r['cards'] if c[5]] + r['notes']
        mark = '✗ 可能溢出' if r['overflow'] else ('△' if flags else '✓')
        bad += r['overflow']
        print(f"{r['id']} {r['layout']:<8} 说明{r['bodySize']}px 估计卡底{r['bottom']:>5}/{CANVAS_BOTTOM} {mark} {'；'.join(flags)}")
    rh = rhythm(res, pages)
    print('\n节奏：' + ('✓ 版式轮换与密度正常' if not rh else ''))
    for x in rh:
        print('  △ ' + x)
    print(f'\n{len(res)} 页，估计溢出 {bad} 页。估算用于分析阶段选版式/字号；定稿以浏览器实测（probe-size / verify）为准。')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
