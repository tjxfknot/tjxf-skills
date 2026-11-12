#!/usr/bin/env python3
"""写入明确指定的飞书文档；须获用户授权。详见 --help。
依赖用户另行提供的兼容 lark-cli，不携带账号或凭据。
"""
import argparse, datetime as dt, html, json, re, subprocess, sys, os
from pathlib import Path

AP = argparse.ArgumentParser(description="把用户授权的一批书签写入用户明确指定的飞书目标；不会向聊天发消息。")
AP.add_argument('file', type=Path, help='记录/<本次>_书签.txt')
AP.add_argument('--doc', required=True, help='用户明确指定的文档 URL 或 ID')
AP.add_argument('--block-id', required=True, help='用户明确指定的插入锚点块 ID')
AP.add_argument('--authorize-write', action='store_true', help='仅在用户已明确授权此次外部写入时使用')
ARGS = AP.parse_args()
if not ARGS.authorize_write:
    AP.error('需要用户明确授权本次飞书写入后传 --authorize-write')
if any(not x.strip() or x.startswith('REPLACE_') for x in (ARGS.doc, ARGS.block_id)):
    AP.error('文档和块 ID 必须为用户指定的真实目标')
DATA = Path.cwd()
CFG = {'飞书文档': ARGS.doc, '插入位置块': ARGS.block_id}
STATE = DATA / "状态.json"
LOG = DATA / "记录" / "运行日志.tsv"
WEEK = "一二三四五六日"

def lark(*args):
    r = subprocess.run(["lark-cli", "docs", *args, "--as", "user"], capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
    except json.JSONDecodeError:
        sys.exit(f"lark-cli 没返回 JSON：{r.stdout[-300:]} {r.stderr[-300:]}")
    if r.returncode != 0 or not d.get("ok", False):
        sys.exit(f"lark-cli 失败：{json.dumps(d, ensure_ascii=False)[:500]}")
    return d

def fmt(t):
    return f"{t.month}月{t.day}日 {t:%H:%M}"

def write(txt_path):
    txt = Path(txt_path)
    pending = json.loads(txt.with_name(txt.name.replace("_书签.txt", "_待提交.json")).read_text(encoding="utf-8"))
    items = [l.strip().lstrip("-•· ").strip() for l in txt.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not items:
        sys.exit("书签是空的")
    t_from, t_to = dt.datetime.fromisoformat(pending["from"]), dt.datetime.fromisoformat(pending["to"])
    head = f"{fmt(t_to)}（周{WEEK[t_to.weekday()]}）更新 · {fmt(t_from)} 之后 · 群里 {pending['count']} 条消息"
    xml = f"<h2>{html.escape(head)}</h2><ul>" + "".join(f"<li>{html.escape(i)}</li>" for i in items) + "</ul>"
    d = lark("+update", "--doc", CFG["飞书文档"], "--command", "block_insert_after",
             "--block-id", CFG["插入位置块"], "--content", xml)
    if d["data"].get("result") != "success":
        sys.exit(f"写入不完整：{json.dumps(d['data'], ensure_ascii=False)[:500]}")
    back = json.dumps(lark("+fetch", "--doc", CFG["飞书文档"]), ensure_ascii=False)
    if head not in back or any(i not in back and html.escape(i) not in back for i in items):
        sys.exit("读回文档没找到刚写的这批，状态没更新，下次会重抓")
    STATE.write_text(json.dumps({"last_time": pending["new_last_time"], "last_keys": pending["new_last_keys"],
                                 "last_run_at": t_to.isoformat(), "last_run": pending["run"]},
                                ensure_ascii=False, indent=1), encoding="utf-8")
    new_log = not LOG.exists()
    with LOG.open("a", encoding="utf-8") as f:
        if new_log:
            f.write("本次\t范围起点\t截图页数\t消息数\t书签数\n")
        f.write(f"{pending['run']}\t{pending['from']}\t{pending['pages']}\t{pending['count']}\t{len(items)}\n")
    print(f"已写入 {len(items)} 条书签：{CFG['飞书文档']}")

if __name__ == "__main__":
    write(ARGS.file)
