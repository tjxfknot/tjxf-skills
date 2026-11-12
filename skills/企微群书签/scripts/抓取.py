#!/usr/bin/env python3
"""从企微截图里读出群消息，按时间整理成原文。在群的工作目录里运行（目录里要有 配置.json）。

  python3 <skill>/scripts/抓取.py                          从 状态.json 记的截止点抓到现在
  python3 <skill>/scripts/抓取.py --since "2026-10-22 00:00"  首次或补抓时指定起点

流程：抓屏.sh 先截首批 → 识字 → 没翻到截止点就再截一批 → 切回原应用 → 各页按重叠拼接 → 按截止点去掉旧消息。
产出：记录/<本次>_原文.md、记录/<本次>_待提交.json。状态在写飞书成功后才由 写入飞书.py 更新，失败了下次会重抓。
"""
import argparse, datetime as dt, json, re, subprocess, sys, os
from pathlib import Path

if "--help" in sys.argv or "-h" in sys.argv:
    print(__doc__)
    print("Options: --since YYYY-MM-DD HH:MM; WEWORK_BOOKMARK_SUPPORT overrides local runtime directory.")
    sys.exit(0)

HERE = Path(__file__).resolve().parent
SUP = Path(os.environ.get("WEWORK_BOOKMARK_SUPPORT", str(Path.home() / "Library/Application Support/企微群书签"))).expanduser()
OCR = SUP / "wework-ocr"
DATA = Path.cwd()                                     # 群的工作目录：配置.json、状态.json、记录/
if not (DATA / "配置.json").exists():
    sys.exit(f"当前目录没有 配置.json：{DATA}。请先 cd 到这个群的工作目录（新群见 SKILL.md「第一次用」）")
CFG = json.loads((DATA / "配置.json").read_text(encoding="utf-8"))
if not isinstance(CFG.get("群名"), str) or not CFG["群名"].strip() or CFG["群名"].startswith("REPLACE_"):
    sys.exit("配置.json 必须填写用户指定的完整群名")
for field in ("首批页数", "每批页数", "最多页数"):
    if field in CFG and (type(CFG[field]) is not int or not 1 <= CFG[field] <= 1000):
        sys.exit(field + " 必须是 1..1000 的整数")
STATE = DATA / "状态.json"
REC = DATA / "记录"
WEEK = "一二三四五六日"

def sh(*args):
    r = subprocess.run(["zsh", str(HERE / "抓屏.sh"), *map(str, args)], capture_output=True, text=True)
    out = r.stdout.strip().splitlines()
    if r.returncode != 0:
        sys.exit("抓屏失败：" + (out[-1] if out else r.stderr.strip()))
    return out

def ocr(paths):
    if not paths:
        return {}
    r = subprocess.run([str(OCR), *map(str, paths)], capture_output=True, text=True)
    pages = {}
    for ln in r.stdout.splitlines():
        d = json.loads(ln)
        pages[Path(d["file"]).stem] = d
    return pages

def norm(s):
    return re.sub(r"[^\w一-鿿]", "", s)

def parse_time(t, now):
    t = t.replace("：", ":").strip()
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", t)
    if m:
        return now.replace(hour=int(m[1]), minute=int(m[2]), second=0, microsecond=0)
    m = re.fullmatch(r"(昨天|前天)\s*(\d{1,2}):(\d{2})", t)
    if m:
        d = now - dt.timedelta(days=1 if m[1] == "昨天" else 2)
        return d.replace(hour=int(m[2]), minute=int(m[3]), second=0, microsecond=0)
    m = re.fullmatch(r"(?:星期|周)([一二三四五六日天])\s*(\d{1,2}):(\d{2})", t)
    if m:
        wd = WEEK.index(m[1].replace("天", "日"))
        for back in range(2, 8):
            d = now - dt.timedelta(days=back)
            if d.weekday() == wd:
                return d.replace(hour=int(m[2]), minute=int(m[3]), second=0, microsecond=0)
    m = re.fullmatch(r"(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})", t)
    if m:
        d = dt.datetime(int(m[1] or now.year), int(m[2]), int(m[3]), int(m[4]), int(m[5]))
        return d.replace(year=d.year - 1) if not m[1] and d > now else d
    return None

def page_lines(p, now):
    """把一页识别结果分成：sep 时间线、sys 系统提示、who 发送人、msg 消息、quote 引用、mine 自己发的。"""
    W, H, L = p["w"], p["h"], p["lines"]
    panel = [l["x"] for l in L if "群成员" in l["t"] and l["x"] > 0.7 * W]
    right = min(panel) - 10 if panel else W          # 右侧群成员栏的左边界
    pin = [l for l in L if "置顶了" in l["t"] and l["y"] < 260]
    top = (pin[0]["y"] + 76) if pin else 130         # 群名栏、置顶横幅之下才是消息
    L = [l for l in L if l["x"] < right - 5 and l["y"] >= top + 4 and l["y"] + l["h"] <= H - 4
         and not re.search(r"条新消息$", l["t"].strip())]
    rows = []                                        # 识别常把同一行拆成左右几段，先按高度拼回整行
    for l in sorted(L, key=lambda l: l["y"] + l["h"] / 2):
        r = rows[-1] if rows else None
        if r and abs((l["y"] + l["h"] / 2) - (r["y"] + r["h"] / 2)) < 0.5 * min(l["h"], r["h"]):
            r["parts"].append(l)
            r["y"], r["h"] = min(r["y"], l["y"]), max(r["y"] + r["h"], l["y"] + l["h"]) - min(r["y"], l["y"])
        else:
            rows.append({"y": l["y"], "h": l["h"], "parts": [l]})
    L = []
    for r in rows:
        ps = sorted(r["parts"], key=lambda p: p["x"])
        x0 = ps[0]["x"]
        L.append({"t": " ".join(p["t"].strip() for p in ps), "x": x0, "y": r["y"], "h": r["h"],
                  "w": max(p["x"] + p["w"] for p in ps) - x0, "c": min(p["c"] for p in ps)})
    out = []
    for l in L:
        t = l["t"].strip()
        x, y, w, h = l["x"], l["y"], l["w"], l["h"]
        if len(t) <= 1 and l["c"] < 0.6:             # 表情、头像边上的噪点
            continue
        cx = x + w / 2
        if abs(cx - right / 2) < 0.08 * right and x > 0.2 * right:
            kind = "sep" if parse_time(t, now) else "sys"
        elif x < 0.023 * W:
            kind = "who"
            t = re.sub(r"\s*\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}$", "", t)   # 鼠标悬停弹出的时间
            t = re.sub(r"\s*@微信$", "", t)
        elif x < 0.036 * W:
            kind = "msg"
        elif x < 0.06 * W:
            kind = "quote"
        elif x > 0.45 * right and x + w > right - 0.06 * W:
            kind = "mine"
        else:
            kind = "msg"
        out.append({"k": kind, "t": t, "key": kind + norm(t), "page": p["page"]})
    return out

def merge(a, b):
    """a 是更早的内容（在上），b 是更新的一页（在下）。找 a 尾和 b 头重叠的部分拼起来。"""
    best = None
    for sa in range(3):
        a2 = a[:len(a) - sa] if sa else a
        for sb in range(3):
            b2 = b[sb:]
            for m in range(min(len(a2), len(b2)), 0, -1):
                if [x["key"] for x in a2[-m:]] == [x["key"] for x in b2[:m]]:
                    long_enough = m >= 2 or len(a2[-1]["t"]) >= 8
                    if long_enough and (best is None or m - sa - sb > best[0]):
                        best = (m - sa - sb, a2, b2[m:])
                    break
    if best:
        return best[1] + best[2]
    return a + [{"k": "gap", "t": "", "key": "gap", "page": b[0]["page"] if b else ""}] + b

def to_messages(lines, now):
    msgs, cur_time, cur = [], None, None
    for l in lines:
        k = l["k"]
        if k == "sep":
            cur_time, cur = parse_time(l["t"], now), None
        elif k == "gap":
            msgs.append({"time": cur_time, "who": "⚠", "text": "这里两页没对上，可能漏了几条，请看截图", "page": l["page"]})
            cur = None
        elif k == "sys":
            msgs.append({"time": cur_time, "who": "系统", "text": l["t"], "page": l["page"]})
            cur = None
        elif k == "who" or k == "mine":
            cur = {"time": cur_time, "who": "我" if k == "mine" else l["t"], "text": "", "quote": "", "page": l["page"]}
            msgs.append(cur)
            if k == "mine":
                cur["text"] = l["t"]
        elif cur is None:
            continue                                  # 第一个发送人之前的半截内容
        elif k == "quote":
            cur["quote"] += l["t"]
        else:
            cur["text"] += ("" if not cur["text"] else " ") + l["t"]
    return [m for m in msgs if m["time"] is not None]

def mkey(m):
    return norm(m["who"] + m.get("text", "") + m.get("quote", ""))[:60]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="起点，如 2026-10-22 00:00；不给就用 状态.json")
    args = ap.parse_args()
    now = dt.datetime.now().replace(second=0, microsecond=0)
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    if args.since:
        cutoff, seen = dt.datetime.strptime(args.since, "%Y-%m-%d %H:%M"), set()
    elif state.get("last_time"):
        cutoff, seen = dt.datetime.fromisoformat(state["last_time"]), set(state.get("last_keys", []))
    else:
        sys.exit("第一次运行要给 --since")

    files = [Path(f) for f in sh("start", CFG.get("首批页数", 6)) if f.endswith(".png")]
    pages, done, bad, reached_top = {}, set(), [], False
    head_of = lambda p: " ".join(l["t"] for l in p["lines"] if l["y"] < 80)
    try:
        while True:
            new = ocr([f for f in files if f.stem not in done])
            done.update(new)
            first = not pages and not bad
            for stem, p in new.items():               # 每页核对顶部群名，被别的窗口挡住的页不用
                p["page"] = stem
                if norm(CFG["群名"])[:8] in norm(head_of(p)):
                    pages[stem] = p
                else:
                    bad.append(stem)
            if first and files[0].stem not in pages:
                sys.exit(f"截图里不是「{CFG['群名']}」（看到的是：{head_of(new[files[0].stem])[:40]}）。"
                         "可能屏幕锁着、企微没登录，或这个群没在企微里置顶。")
            oldest = pages[max(pages)]
            seps = [parse_time(l["t"], now) for l in page_lines(oldest, now) if l["k"] == "sep"]
            if any(s <= cutoff for s in seps if s) or reached_top or len(pages) >= CFG.get("最多页数", 150):
                break
            out = sh("more", CFG.get("每批页数", 10))
            reached_top = "到顶了" in out
            files += [Path(f) for f in out if f.endswith(".png")]
    finally:
        sh("done")

    order = sorted(pages, reverse=True)               # 从最早一页往新拼
    acc = page_lines(pages[order[0]], now)
    for stem in order[1:]:
        acc = merge(acc, page_lines(pages[stem], now))
    msgs = to_messages(acc, now)
    keep = [m for m in msgs if m["time"] > cutoff or (m["time"] == cutoff and mkey(m) not in seen)]
    if args.since:
        keep = [m for m in msgs if m["time"] >= cutoff]

    run = now.strftime("%Y%m%d-%H%M")
    REC.mkdir(exist_ok=True)
    shot_dir = files[0].parent
    newest = max((m["time"] for m in msgs), default=cutoff)
    hit_limit = len(pages) >= CFG.get("最多页数", 150) and not any(
        s and s <= cutoff for s in (parse_time(l["t"], now) for l in page_lines(pages[max(pages)], now) if l["k"] == "sep"))
    gaps = sum(1 for m in keep if m["who"] == "⚠")
    lines = [f"# 原文：{CFG['群名']}", "",
             f"- 抓取时间：{now:%Y-%m-%d %H:%M}",
             f"- 范围：{cutoff:%Y-%m-%d %H:%M} 之后",
             f"- 截图：{shot_dir}（共 {len(pages)} 页，文中〔p001〕是页码，p001 最新）",
             f"- 共 {sum(1 for m in keep if m['who'] not in ('⚠', '系统'))} 条消息；两页没对上 {gaps} 处（标 ⚠）",
             "- 说明：文字由 Mac 自带的文字识别从截图转出。图片、表情、文件卡片里的字读不到，个别字可能认错，数字和日期以截图为准。时间是企微消息上方显示的那个时间。"]
    if hit_limit:
        lines.append(f"- ⚠ 翻到 {CFG['最多页数']} 页上限还没到截止点，更早的消息这次没读到。")
    if bad:
        lines.append(f"- ⚠ {len(bad)} 页截到的不是这个群（被别的窗口挡住）：{'、'.join(sorted(bad))}，那附近可能漏消息。")
    day = None
    for m in keep:
        d = m["time"].date()
        if d != day:
            day = d
            lines += ["", f"## {d.month}月{d.day}日（周{WEEK[d.weekday()]}）"]
        body = m["text"] or "（没识别出文字，可能是图片、表情或文件）"
        if m.get("quote"):
            body += f"  〔回复：{m['quote']}〕"
        lines.append(f"- {m['time']:%H:%M} {m['who']}：{body} 〔{m['page']}〕")
    raw = REC / f"{run}_原文.md"
    raw.write_text("\n".join(lines) + "\n", encoding="utf-8")
    pending = {"run": run, "from": cutoff.isoformat(), "to": now.isoformat(),
               "count": sum(1 for m in keep if m["who"] not in ("⚠", "系统")),
               "pages": len(pages), "shots": str(shot_dir), "raw": str(raw),
               "new_last_time": newest.isoformat(),
               "new_last_keys": [mkey(m) for m in msgs if m["time"] == newest] +
                                (list(seen) if newest == cutoff else [])}
    (REC / f"{run}_待提交.json").write_text(json.dumps(pending, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: pending[k] for k in ("run", "count", "pages", "raw")}, ensure_ascii=False))

if __name__ == "__main__":
    main()
