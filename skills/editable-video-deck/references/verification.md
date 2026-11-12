# 验证

构建依赖 Python 3；测试版标黄依赖 Node.js。浏览器检查额外需要已安装的 Playwright 与可用 Chromium/Chrome，不自动安装。`PLAYWRIGHT_MODULE` 可指定 Playwright 模块目录；`CHROME_PATH` 可指定 Chrome 可执行文件。检查运行在新建临时浏览器上下文中。

先运行 `python3 scripts/build_deck.py --help`，然后用 demo 的 plan/content 构建。按任务挑选以下行为检查：

```bash
node scripts/checks/offline.cjs assets/examples/demo/demo.html
node scripts/checks/stable.cjs assets/examples/demo/demo.html
node scripts/checks/verify.cjs assets/examples/demo/demo.html 验证输出目录 assets/examples/demo/content.json
node scripts/checks/importtest.cjs assets/examples/demo/demo.html 验证输出目录
node scripts/checks/spacing.cjs assets/examples/demo/demo.html
```

`verify` 检查逐页逐步溢出、编辑、保存刷新与导出重开；`stable` 检查尺寸和断行稳定；`offline` 检查页面静态资源外链，不代表语音识别绝不联网；`spacing` 检查卡片重叠和超底；`importtest` 检查 JSON 备份导入。未执行的检查如实标未验，不能沿用原内部项目的旧结论。

其他保留脚本：`lines` 断行、`flyaudit` 动画、`packs` 主题包、`styles` 风格对比、`phone` 手机尺寸、`dragtest` 换位、`snaptest` 吸附、`bgimg` 上传底图、`pictest` 配图、`voice` 假识别模拟、`voice-replay` 真实记录回放。按各脚本头部说明传参；图片与回放记录须由用户提供。

公共版使用系统字体，容量检查只能粗估。人工确认内容覆盖、实际设备字号、主播留位、麦克风与真实拍摄效果。不要为了通过数字检查而删掉原文事实。
