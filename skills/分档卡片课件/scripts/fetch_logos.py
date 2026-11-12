#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给卡片抓图标（校徽/机构标识），做成墨稿水印内嵌进 HTML。

用法：
    python3 fetch_logos.py <deck.html> [--size 220] [--dry]

做什么：
    1. 从 deck.html 的 DATA 里取出所有条目名
    2. 走维基百科 API 批量拿每个条目的主图缩略图 URL
    3. 逐个下载（串行 + 限速，并发会被限流）
    4. 校验是不是真 PNG、原始文件名像不像图标（含 logo/seal/emblem/badge/徽）
    5. base64 内嵌成 .lg-N 规则，写回 HTML，并填好 LOGO 映射

注意：
    - 本机 python 的 SSL 证书链在代理下会失败，所以网络请求一律走 curl
    - 图标是各机构的注册标识，内部课件水印属常见用法；对外发布前请自行确认授权
    - 抓不到或抓错的会打印出来，人工补：把图片存成 logos/<条目名>.img（png/jpg 都行）再重跑
    - 抓错比抓不到更糟：别用 list=search 猜条目，它会把"上海财经"搜成"中央财经"
"""
import base64, json, os, re, subprocess, sys, urllib.parse

# 维基上的图标有 PNG 也有 JPG。JPG 没有透明通道，但墨稿算法靠亮度判断，白底照样能抠出笔画
MAGIC = {b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg"}


def kind(path):
    """返回 MIME，认不出就 None（说明下到的是 HTML 错误页）"""
    if not os.path.exists(path):
        return None
    head = open(path, "rb").read(4)
    for sig, mime in MAGIC.items():
        if head.startswith(sig):
            return mime
    return None

UA = "Mozilla/5.0 (deck-slide-builder; +local course slides)"
KW = ("logo", "seal", "emblem", "badge", "徽", "crest", "identifier")


def sh(args, timeout=60):
    return subprocess.run(args, capture_output=True, timeout=timeout).stdout


def curl(url, out=None, timeout=40):
    a = ["curl", "-s", "--max-time", str(timeout), "-A", UA, url]
    if out:
        a[1:1] = ["-o", out]
    return sh(a, timeout + 10)


def load_names(html):
    m = re.search(r"/\*DATA_START\*/\s*let DATA =\s*(\{.*?\});?\s*/\*DATA_END\*/", html, re.S)
    d = json.loads(m.group(1))
    return d, [it["name"] for t in d["tiers"] for it in t.get("items", [])]


def wiki_thumbs(names, size):
    """一次最多 50 个标题。返回 {条目名: (thumb_url, 原始文件名)}"""
    out = {}
    for i in range(0, len(names), 50):
        batch = names[i:i + 50]
        url = ("https://zh.wikipedia.org/w/api.php?action=query&titles="
               + urllib.parse.quote("|".join(batch))
               + f"&prop=pageimages&pithumbsize={size}&pilicense=any&format=json&redirects=1")
        try:
            data = json.loads(curl(url) or b"{}")
        except Exception:
            continue
        q = data.get("query", {})
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        pages = {p.get("title"): (p.get("thumbnail") or {}).get("source") for p in q.get("pages", {}).values()}
        for n in batch:
            u = pages.get(norm.get(n, n))
            if not u:
                continue
            fn = urllib.parse.unquote(u.split("/thumb/")[1].split("/")[2]) if "/thumb/" in u else u.rsplit("/", 1)[-1]
            out[n] = (u, fn)
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 220
    dry = "--dry" in sys.argv

    html = open(path, encoding="utf-8").read()
    data, names = load_names(html)
    print(f"条目 {len(names)} 个")

    os.makedirs("logos", exist_ok=True)
    found = wiki_thumbs(names, size)
    miss = [n for n in names if n not in found]
    suspect = [(n, fn) for n, (u, fn) in found.items() if not any(k in fn.lower() for k in KW)]

    # 人工补的图（logos/<条目名>.img）优先认领，API 没找到也算数
    ok, bad = [], []
    for n in names:
        if n in found:
            continue
        f = "logos/" + re.sub(r"[^0-9A-Za-z一-龥]", "_", n) + ".img"
        if kind(f):
            ok.append((n, f))
            miss = [x for x in miss if x != n]

    # 串行下载：并发会被 wikimedia 限流，返回 HTML 错误页
    for n, (u, fn) in found.items():
        f = "logos/" + re.sub(r"[^0-9A-Za-z一-龥]", "_", n) + ".img"
        if not kind(f):
            if dry:
                continue
            curl(u, out=f)
            subprocess.run(["sleep", "0.6"])   # 并发会被限流，必须串行
        (ok if kind(f) else bad).append((n, f))

    print(f"下到 {len(ok)} 个，失败 {len(bad)}")
    if miss:
        print("！维基没有主图，需要人工补：", miss)
    if suspect:
        print("！文件名不像图标，开图确认一下：", suspect)
    if bad:
        print("！下载失败（重跑一次即可）：", [n for n, _ in bad])
    if dry:
        return

    # 内嵌：base64 只存一份，两个 mask 属性都引用 CSS 变量
    rules, idx = [], {}
    for i, (n, f) in enumerate(sorted(ok)):
        b64 = base64.b64encode(open(f, "rb").read()).decode()
        idx[n] = i
        rules.append(f".lg-{i}{{--m:url(data:{kind(f)};base64,{b64});"
                     f"-webkit-mask-image:var(--m);mask-image:var(--m)}}")

    html = re.sub(r"\.lg-\d+\{--m:url\(data:image/(?:png|jpeg);base64,[A-Za-z0-9+/=]+\);"
                  r"-webkit-mask-image:var\(--m\);mask-image:var\(--m\)\}\n?", "", html)
    html = html.replace("/* ============ 工具栏 ============ */",
                        "\n".join(rules) + "\n/* ============ 工具栏 ============ */", 1)
    html = re.sub(r"const LOGO = \{.*?\};", "const LOGO = " + json.dumps(idx, ensure_ascii=False) + ";", html, count=1, flags=re.S)
    open(path, "w", encoding="utf-8").write(html)
    print(f"已写回 {path}，{len(rules)} 个图标，文件 {round(len(html.encode('utf-8'))/1024/1024, 2)} MB")


if __name__ == "__main__":
    main()
