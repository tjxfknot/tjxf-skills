#!/bin/zsh
# 双击运行：录口播课件成视频，默认复制到桌面。
# 先在课件里点「录成视频」（或「导出 HTML」）——录的是导出的文件，浏览器里没导出的修改录不进去。
# 也可以把 HTML 拖到终端里：./录制课件视频.command 课件.html
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DIR="$(cd "$(dirname "$0")" && pwd)"
# 与同目录脚本一起分发，也可显式指定脚本目录
DIR="${KJ_SCRIPTS_DIR:-$DIR}"
[ -f "$DIR/record.cjs" ] || { echo "缺少同目录 record.cjs；请设置 KJ_SCRIPTS_DIR"; exit 1; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print "用法：录制课件视频.command [deck.html]；交互式 macOS 启动器。支持 KJ_SCRIPTS_DIR、KJ_DOWNLOADS、KJ_DESKTOP。"
  exit 0
fi
FILE="$1"
if [ -z "$FILE" ]; then
  HTMLS=("${KJ_DOWNLOADS:-$HOME/Downloads}"/*.html(N.om))   # 下载文件夹里的 HTML，最新的在前；一个都没有时为空
  NEW="${HTMLS[1]}"
  if [ -n "$NEW" ]; then
    NAME=$(basename "$NEW" | sed 's/"/＂/g'); T=$(stat -f "%Sm" -t "%m月%d日 %H:%M" "$NEW")
    ANS=$(osascript -e "button returned of (display dialog \"录刚导出的这份吗？\n\n$NAME\n（$T 导出到「下载」）\" buttons {\"取消\", \"选别的文件\", \"录这份\"} default button \"录这份\" with title \"录制课件视频\")" 2>/dev/null) || exit 0
    [ "$ANS" = "录这份" ] && FILE="$NEW"
  fi
  if [ -z "$FILE" ]; then
    FILE=$(osascript -e 'POSIX path of (choose file with prompt "选要录成视频的口播课件（HTML）" of type {"public.html"} default location (path to downloads folder))' 2>/dev/null) || exit 0
  fi
fi
SIZE=$(osascript -e 'choose from list {"2880×2160 原比例（4:3）", "3840×2160 宽屏（16:9，两侧补底色）"} with prompt "视频尺寸" default items {"2880×2160 原比例（4:3）"}' 2>/dev/null)
[ "$SIZE" = "false" ] || [ -z "$SIZE" ] && exit 0
FRAME=43; [[ "$SIZE" == 3840* ]] && FRAME=169
HOLD=$(osascript -e 'text returned of (display dialog "每一步（页面出现、每讲一条）停几秒？" default answer "3")' 2>/dev/null) || exit 0
FPS=$(osascript -e 'choose from list {"60", "30"} with prompt "帧率" default items {"60"}' 2>/dev/null)
[ "$FPS" = "false" ] || [ -z "$FPS" ] && exit 0

echo "开始录制：$FILE"
echo "（整套 24 页约 8 分钟，期间别关这个窗口）"
node "$DIR/record.cjs" "$FILE" --frame "$FRAME" --hold "$HOLD" --fps "$FPS"
CODE=$?
if [ $CODE -eq 0 ]; then
  osascript -e 'display notification "视频已放到桌面" with title "口播课件录制完成"'
  open "${KJ_DESKTOP:-$HOME/Desktop}"
else
  osascript -e 'display notification "没录成，看终端里的提示" with title "口播课件录制"'
fi
echo; read -k1 "?按任意键关闭窗口"
