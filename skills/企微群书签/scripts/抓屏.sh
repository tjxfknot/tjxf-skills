#!/bin/zsh
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print "用法：抓屏.sh start <页数> | more <页数> | done；只点击固定导航/滚动，支持 WEWORK_BOOKMARK_SUPPORT。"
  exit 0
fi
# 把企微拉到前面、打开群、从最新往上一页页截聊天区。由 抓取.py 调用。
#   zsh 抓屏.sh start <页数>         新开一批：记下你当前在用的应用，点开置顶的群，第 1 页是最新消息，往上翻
#   zsh 抓屏.sh more <页数>          接着往上翻
#   zsh 抓屏.sh done                 鼠标放回、切回你原来在用的应用
# 截图放在 ~/Library/Application Support/企微群书签/截图/<批次>/，打印本次新增的文件；翻不动了打印「到顶了」。
setopt NO_NOMATCH
SUP="${WEWORK_BOOKMARK_SUPPORT:-$HOME/Library/Application Support/企微群书签}"
APP="$SUP/企微翻页.app"
RES="$SUP/翻页结果.json"
CUR="$SUP/截图/当前批次"
PREV_FILE="$SUP/截图/原来的应用"
PAGE_UP=480   # 每页往上翻的点数，聊天区约 640 点高，留四分之一重叠
INPUT_H=160   # 底部输入框高度，截图时去掉

back() {
  open -g -W "$APP" --args restore 2>/dev/null
  local prev=$(cat "$PREV_FILE" 2>/dev/null)
  [[ -n "$prev" && "$prev" != "com.tencent.WeWorkMac" ]] && open -b "$prev" 2>/dev/null
}

front() {  # 企微不在最前面就唤回来，等桌面空间切换完
  if [[ "$(lsappinfo info -only bundleid "$(lsappinfo front)" 2>/dev/null)" != *com.tencent.WeWorkMac* ]]; then
    open -b com.tencent.WeWorkMac; sleep 1.5
  fi
}

pager() {  # 调翻页工具；找不到窗口就唤回企微再试一次，还不行就打印原因、切回原应用并退出
  open -g -W "$APP" --args "$@" 2>/dev/null
  if [[ "$(plutil -extract msg raw -o - "$RES" 2>/dev/null)" == 找不到企微窗口* ]]; then
    open -b com.tencent.WeWorkMac; sleep 2
    open -g -W "$APP" --args "$@" 2>/dev/null
  fi
  if [[ "$(plutil -extract ok raw -o - "$RES" 2>/dev/null)" != "true" ]]; then
    echo "翻页工具失败：$(plutil -extract msg raw -o - "$RES" 2>/dev/null || echo 没有结果文件)"
    back; exit 1
  fi
}

shot() {  # 截聊天区：留顶部群名栏（用来核对群对不对），去掉底部输入框
  local f="$1"
  local x=$(plutil -extract x raw -o - "$RES") y=$(plutil -extract y raw -o - "$RES")
  local w=$(plutil -extract w raw -o - "$RES") h=$(plutil -extract h raw -o - "$RES")
  local cl=$(plutil -extract chat_left raw -o - "$RES")
  screencapture -x -R"$((x + cl)),$y,$((w - cl)),$((h - INPUT_H))" "$f" && sips -Z 1568 "$f" >/dev/null 2>&1
}

case "$1" in
  start)
    lsappinfo info -only bundleid "$(lsappinfo front)" 2>/dev/null | sed -E 's/.*="?([^"]*)"?/\1/' > "$PREV_FILE"
    open -b com.tencent.WeWorkMac && sleep 1.5
    BATCH=$(date +%Y%m%d-%H%M%S); DIR="$SUP/截图/$BATCH"; mkdir -p "$DIR"; echo "$BATCH" > "$CUR"
    pager open
    START=1; END=${2:-6}
    shot "$DIR/p001.png"; echo "$DIR/p001.png"
    ;;
  more)
    BATCH=$(cat "$CUR" 2>/dev/null); DIR="$SUP/截图/$BATCH"
    [[ -z "$BATCH" || ! -d "$DIR" ]] && { echo "没有进行中的批次，先跑 start"; back; exit 1; }
    front
    pager check
    START=$(ls "$DIR"/p*.png 2>/dev/null | wc -l | tr -d ' '); END=$((START + ${2:-8}))
    ;;
  done) back; exit 0 ;;
  *) echo "用法：start <页数> | more <页数> | done"; exit 1 ;;
esac

i=$START
while (( i < END )); do
  front
  pager up $PAGE_UP
  i=$((i + 1)); f=$(printf "$DIR/p%03d.png" $i); prev=$(printf "$DIR/p%03d.png" $((i - 1)))
  shot "$f"
  if [[ "$(md5 -q "$f")" == "$(md5 -q "$prev")" ]]; then
    sleep 2; shot "$f"   # 可能是更早的消息还在加载，等一下再截
    if [[ "$(md5 -q "$f")" == "$(md5 -q "$prev")" ]]; then rm "$f"; echo "到顶了"; break; fi
  fi
  echo "$f"
done
