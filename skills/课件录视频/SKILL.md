---
name: record-video-deck
description: 把兼容 editable-video-deck 单页引擎的本地 HTML 课件逐帧录成 MP4，输出步骤时间表和总览图；不支持任意 HTML 或实时桌面录屏。
---

# 课件录视频

本包包含自建录制源码，不含浏览器、Node.js、Playwright、ffmpeg、字体、业务课件或二进制工具包。用户自行准备依赖；技能不会自动安装、下载或发布。录制在本机进行，但输入 HTML 会执行脚本；只对用户指定的可信课件运行，涉及外部资源时先核对是否允许联网。

## 准备与配置

需要 Node.js、`playwright-core` 或 `playwright`、Chrome/Edge/Chromium、支持 libx264 的 ffmpeg；ffprobe 可选。依赖各自许可证由分发者核验，本包不再分发它们。可通过以下环境变量配置，无需修改个人路径：

| 变量 | 用途 |
|---|---|
| `NODE_PATH` | Node 模块搜索目录 |
| `PLAYWRIGHT_MODULE` | 显式指定用户安装的 Playwright 模块 |
| `CHROME_PATH` | 浏览器可执行文件 |
| `KJ_FFMPEG` / `KJ_FFPROBE` | 对应可执行文件 |
| `KJ_DOWNLOADS` / `KJ_DESKTOP` / `KJ_OUTPUT` | 下载、桌面和默认视频目录 |
| `KJ_SCRIPTS_DIR` | macOS 双击启动器的脚本目录，默认同目录 |

`env.cjs` 可查同目录依赖和 PATH/常见系统位置；同目录出现 `bin/` 时只使用包内 ffmpeg，防止误混版本。Linux 请用 `CHROME_PATH` 指定浏览器。没有配置正确就说明缺口，不宣称免安装可用。

## 使用

```bash
node <本技能>/scripts/record.cjs --help
node <本技能>/scripts/record.cjs <课件.html> --hold 3 --fps 60 --frame 43 --pages 1-2 --no-desktop
node <本技能>/scripts/record.cjs --newest [课件名] --out <输出目录> --no-desktop
```

默认 2880×2160、60 帧、每步 3 秒；`--frame 169` 为 3840×2160，4:3 画面居中。先录少量页确认效果，再跑整套。时间随机器和课件变化，不能承诺固定耗时。默认自动并行，`--workers` 控制数量。
录的是导出文件，编辑台未导出的浏览器修改不会被录入。先核对摘要选中的实际文件；`--newest` 读取配置的下载目录中的最新 HTML。同名视频与日志会重建，因此重复录制应使用新的 `--out` 目录；桌面副本默认自动添加后缀，需保留历史时仍应指定新输出目录。

仅兼容含 `DATA_START` 标记、DATA.pages 和 step/capture/render/check/resize/detailCount/cancelMotion 等全局接口的单页课件。可与相邻 `editable-video-deck` 技能协作，但不假定所有版本都兼容；接口缺失就停止，不修改原课件绕过检查。

## 结果与验证

输出 MP4、同名 CSV 步骤起点、总览 PNG 和日志；默认另复制 MP4/CSV 到桌面，`--no-desktop` 可关闭。
脚本分段逐帧渲染、合并、检查规格和帧数、整片解码，再汇总页面错误。自检失败时报告失败页和日志，按需查看总览，不把有文件当作录制成功。时间表采用每步固定秒数，实际口播需在剪辑中调整。
未在目标机器实际渲染时只报告静态检查；Windows/Linux 兼容性须分别实测。原环境的签名更新、云存储、发布后台和自更新外壳未包含，不能宣称已具备。

原理：worker 用无头浏览器逐帧拨动网页动画，再通过管道交给 ffmpeg。等待尚未开始的动画 ready 后再暂停，可减少截图互锁；截图超时会有限次重启恢复，段失败最多重跑一次，不无限重试。布局溢出或接口变化仍可能需要课件维护。
