#!/usr/bin/env python3
"""单页多版式口播课件构建（editable-video-deck 0.4.0）

用法：
  python3 build_deck.py 规划.json 内容.json 输出.html [--skeleton 骨架.html]

- 内容.json：{pages:[{id,title,tag,lead,note,design,groups:[{id,label,title,body,cue?,pic?}]}], sourceSegments?, sourceRevision?}
  pic＝卡片配图 {src:相对内容.json的图片路径, h:图框高px, fit:contain|cover}；构建时压成 WebP（有 cwebp 时，最长边 1600）内嵌为 img
- 规划.json：版式、字号、格子位置、页面特例、章节导航、文字修正（带原文断言）。字段说明见 references/plan-schema.md
- 输出：成品 HTML ＋ 同名 .data.json（写进 HTML 的 DATA，便于对比与回滚）
骨架默认用 assets/skeleton/paged-4x3-skeleton.html；引擎是 assets/engine/engine.css + engine.js（+ phone.js 手机预览、packs.js 主题包与挑风格、record.js 录成视频入口、pinyin.js 拼音表＋voice.js 语音跟读）。
本脚本只做数据装配与注入，不改正文措辞——措辞改动必须写在规划的 textFixes 里并逐条断言原文。
"""
from pathlib import Path
import argparse, base64, json, re, shutil, subprocess, sys, tempfile

ROOT = Path(__file__).resolve().parents[1]
LAYOUTS = ['tree', 'steps', 'flow', 'fork', 'rows', 'proj', 'college', 'grid2', 'sum', 'master', 'bh', 'htree', 'chips', 'podium']
DESIGN_KEYS = {'titleSize', 'cardSize', 'bodySize', 'gap', 'width', 'top'}
OPT_KEYS = {'labelw', 'root', 'cols', 'maxWidth', 'compact', 'together', 'chips', 'rootw', 'podw', 'podh'}
# 骨架里写死的通用字样 → 规划 deck 字段（数量是断言：骨架换了就会报错，不会静默漏替换）
SKELETON_SLOTS = [
    ("EVD_PUBLIC_TITLE", 'title', 2),
    ("evd-public-skeleton-key", 'key', 2),
    ("evd-public-export.html", 'exportName', 1),
    ("evd-public-backup.json", 'backupName', 1),
]


def die(msg):
    sys.exit('构建失败：' + msg)


def pic_data_url(f):
    """卡片配图：本地图片 → data URL。有 cwebp 就压成 WebP（最长边 1600），否则原样内嵌 png/jpeg/webp"""
    mime = {'.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp'}.get(f.suffix.lower())
    if not mime:
        die(f'配图格式不支持：{f}')
    raw, kind = f.read_bytes(), mime
    if shutil.which('cwebp'):
        with tempfile.TemporaryDirectory() as t:
            out = Path(t) / 'p.webp'
            r = subprocess.run(['cwebp', '-quiet', '-q', '86', '-metadata', 'none', str(f), '-o', str(out)], capture_output=True)
            if r.returncode == 0:
                dims = subprocess.run(['webpinfo', str(out)], capture_output=True, text=True).stdout if shutil.which('webpinfo') else ''
                m = re.search(r'Width: (\d+)\s+Height: (\d+)', dims)
                if m and max(int(m.group(1)), int(m.group(2))) > 1600:
                    w, h = int(m.group(1)), int(m.group(2))
                    rs = ['-resize', '1600', '0'] if w >= h else ['-resize', '0', '1600']
                    subprocess.run(['cwebp', '-quiet', '-q', '86', '-metadata', 'none', *rs, str(f), '-o', str(out)], check=True)
                raw, kind = out.read_bytes(), 'webp'
    url = f'data:image/{kind};base64,' + base64.b64encode(raw).decode()
    if len(url) >= 4_000_000:
        die(f'配图太大（{len(url)//1024}KB 编码后），先压缩：{f}')
    return url


def embed_pics(d, base_dir):
    n = 0
    for p in d['pages']:
        for g in p['groups']:
            pic = g.get('pic')
            if not pic:
                continue
            if 'src' in pic:
                f = (base_dir / pic.pop('src')).resolve()
                if not f.exists():
                    die(f"{g['id']} 配图不存在：{f}")
                pic['img'] = pic_data_url(f)
            if not str(pic.get('img', '')).startswith('data:image/'):
                die(f"{g['id']} pic 需要 src（图片路径）或 img（data URL）")
            pic['h'] = max(120, min(900, int(pic.get('h', 480))))
            pic['fit'] = 'cover' if pic.get('fit') == 'cover' else 'contain'
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan'); ap.add_argument('content'); ap.add_argument('out')
    ap.add_argument('--skeleton', default=str(ROOT / 'assets/skeleton/paged-4x3-skeleton.html'))
    a = ap.parse_args()
    plan = json.loads(Path(a.plan).read_text())
    d = json.loads(Path(a.content).read_text())
    if isinstance(d, list):
        d = {'pages': d}
    deck = plan.get('deck', {})
    for k in ('title', 'key', 'exportName'):
        if not deck.get(k):
            die(f'规划 deck.{k} 未填写')
    deck.setdefault('backupName', deck['title'] + '-内容与样式备份.json')
    d.update(deck.get('settings', {}))

    P = {p['id']: p for p in d['pages']}
    G = {g['id']: g for p in d['pages'] for g in p['groups']}
    if len(P) != len(d['pages']) or len(G) != sum(len(p['groups']) for p in d['pages']):
        die('页 id 或卡片 id 有重复')

    # 文字修正：只改规划里点名的字段，每条断言原文
    for f in plan.get('textFixes', []):
        tgt = P.get(f['id']) or G.get(f['id'])
        if tgt is None:
            die(f"textFixes 找不到 {f['id']}")
        cur = tgt.get(f['key'], '')
        if 'old' in f:
            if cur != f['old']:
                die(f"textFixes 原文不符 {f['id']}.{f['key']}：现为 {cur!r}")
            tgt[f['key']] = f['new']
        else:
            if f['find'] not in cur:
                die(f"textFixes 找不到片段 {f['id']}.{f['key']}：{f['find']!r}")
            tgt[f['key']] = cur.replace(f['find'], f['replace'])
    for r in plan.get('removeKeys', []):
        tgt = P.get(r['id']) or G.get(r['id'])
        if tgt is None:
            die(f"removeKeys 找不到 {r['id']}")
        tgt.pop(r['key'], None)

    # 版式、字号、格子、页面特例
    base = plan.get('defaults', {}).get('design', {})
    pp = plan.get('pages', {})
    missing = [pid for pid in P if pid not in pp]
    if missing:
        die('规划缺少页面：' + ','.join(missing))
    extra = [pid for pid in pp if pid not in P]
    if extra:
        die('规划里有内容中不存在的页面：' + ','.join(extra))
    for p in d['pages']:
        cfg = pp[p['id']]
        if cfg.get('layout') not in LAYOUTS:
            die(f"{p['id']} 版式 {cfg.get('layout')!r} 不在 {LAYOUTS}")
        p['layout'] = cfg['layout']
        des = p.setdefault('design', {})
        des.update(base)
        des.update(cfg.get('design', {}))
        bad = set(des) - DESIGN_KEYS
        if bad:
            die(f"{p['id']} design 有未知字段 {bad}")
        opts = cfg.get('opts')
        if opts:
            bad = set(opts) - OPT_KEYS
            if bad:
                die(f"{p['id']} opts 有未知字段 {bad}")
            p['opts'] = opts
        cells = cfg.get('cells')
        if cells:
            if len(cells) > len(p['groups']):
                die(f"{p['id']} cells 比卡片多")
            if len({tuple(c) for c in cells}) != len(cells):
                die(f"{p['id']} cells 有重复格子")
            for g, (c, r) in zip(p['groups'], cells):
                g['cell'] = {'c': c, 'r': r}
        p.setdefault('lead', '')
        p.setdefault('note', '')
    if plan.get('nav'):
        for s in plan['nav']:
            if s['start'] not in P:
                die(f"nav 起始页 {s['start']} 不存在")
        d['nav'] = plan['nav']

    pics = embed_pics(d, Path(a.content).resolve().parent)

    # 残留样张文字：样张说明句出现在内容里就停，占位字只提醒（residue_check.py）
    sys.path.insert(0, str(ROOT / 'scripts'))
    from residue_check import check as residue
    if 'layout-gallery' not in str(Path(a.content).resolve()):
        r_bad, r_warn = residue(d)
        for x in r_warn:
            print('△ 占位字，请确认：' + x)
        if r_bad:
            die('内容里混进了版式样张的说明文字：\n  ' + '\n  '.join(r_bad))

    # 注入骨架
    s = Path(a.skeleton).read_text()
    s, n = re.subn(r'/\*DATA_START\*/\s*let DATA = [\s\S]*?;\s*/\*DATA_END\*/',
                   lambda m: '/*DATA_START*/\nlet DATA = ' + json.dumps(d, ensure_ascii=False, indent=2) + ';\n/*DATA_END*/', s, count=1)
    if n != 1:
        die('骨架里找不到 DATA_START/DATA_END')
    for old, key, cnt in SKELETON_SLOTS:
        if s.count(old) != cnt:
            die(f'骨架里 {old!r} 出现 {s.count(old)} 次，预期 {cnt} 次（骨架已变，先核对再改本表）')
        s = s.replace(old, deck[key])
    css = (ROOT / 'assets/engine/engine.css').read_text()
    js = '\n'.join((ROOT / 'assets/engine' / f).read_text() for f in ('engine.js', 'phone.js', 'packs.js', 'record.js', 'pinyin.js', 'voice.js'))
    if re.search(r'</(script|style)', css + js, re.I):
        die('引擎文件里出现了 </script> 或 </style>（注释里也不行），会提前结束标签')
    cfg = {'key': deck['key'], 'navLabel': deck.get('navLabel', '章节'), 'newPageTag': deck.get('newPageTag', ''),
           'newPageLayout': deck.get('newPageLayout', 'rows'), 'defaultDesign': base}
    s = s.replace('</head>', '<style id="evd-engine">' + css + '</style></head>', 1)
    pos = s.rfind('</script>')
    s = s[:pos] + '\nconst DECK_CFG=' + json.dumps(cfg, ensure_ascii=False) + ';\n' + js + s[pos:]
    out = Path(a.out)
    out.write_text(s)
    out.with_suffix('.data.json').write_text(json.dumps(d, ensure_ascii=False, indent=2))
    print(f'已生成 {out}（{len(d["pages"])} 页，{sum(len(p["groups"]) for p in d["pages"])} 张卡，原稿段 {len(d.get("sourceSegments", []))} 条{("，配图 %d 张" % pics) if pics else ""}）')


if __name__ == '__main__':
    main()
