#!/bin/zsh
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print "用途：编译自建翻页和OCR工具；仅用户授权后运行。支持 WEWORK_BOOKMARK_SUPPORT。"
  exit 0
fi
# 编好两个小工具，放到 ~/Library/Application Support/企微群书签/：
#   企微翻页.app（打开群、翻页，要辅助功能权限）和 wework-ocr（识字，名字必须是英文）
# 注意：重新编译后系统会当成新程序，「辅助功能」里要先点「−」删掉旧的「企微翻页」再加回来打开。
set -e
HERE="${0:A:h}"
SUP="${WEWORK_BOOKMARK_SUPPORT:-$HOME/Library/Application Support/企微群书签}"
APP="$SUP/企微翻页.app"
mkdir -p "$APP/Contents/MacOS"
swiftc -O -o "$APP/Contents/MacOS/企微翻页" "$HERE/企微翻页.swift"
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>org.skilltools.wework-pager</string>
  <key>CFBundleName</key><string>企微翻页</string>
  <key>CFBundleDisplayName</key><string>企微翻页</string>
  <key>CFBundleExecutable</key><string>企微翻页</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict>
</plist>
EOF
codesign --force --sign - --identifier org.skilltools.wework-pager "$APP"
swiftc -O -o "$SUP/wework-ocr" "$HERE/识字.swift"
echo "已编好：$APP 和 wework-ocr"
