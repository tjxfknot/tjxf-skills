# 内容.json 与 规划.json（build_deck.py 的两个输入）

分工：**内容.json 管文字**（逐页逐卡，来自原稿映射）；**规划.json 管呈现**（版式、字号、位置、导航、文字修正）。规划由「内容呈现分析」skill 产出。完整实例：`assets/examples/demo/`（三页合成演示）。

## 内容.json

```json
{
  "pages": [
    {"id": "N01", "title": "页标题", "tag": "角标（小字）", "lead": "引导语（可空）", "note": "给主播看的备注（不上屏）",
     "groups": [
       {"id": "N01-g1", "label": "类别标签", "title": "重点", "body": "说明，可多行\n键：值",
        "cue": {"segmentIds": ["SEG-001"], "sourceText": "对应原稿", "phrases": ["口播触发词"], "delayMs": 300}}
     ]}
  ],
  "sourceSegments": [{"id": "SEG-001", "text": "原稿段落", "screenId": "N01", "disposition": "口播原文|原稿备注|不上屏"}],
  "sourceRevision": "原稿文件名 日期"
}
```
- 页 id、卡 id 全局唯一且稳定（字母数字-_）。卡片顺序＝讲解顺序。
- 原稿找不到出处的内容写 `【待核】…`，屏幕上醒目标出。不写“原稿称／推测／待核实”这类草稿说法。
- `cue`、`sourceSegments` 可省；有就能用编辑台的原稿对照和语音跟读（0.5.0）。语音跟读靠 `sourceSegments` 里 disposition 以“口播”开头的段拼成全文定位，`screenId` 写对页 id 才能在本页口播开头翻页；`cue.phrases` 写**这一页口播里真会说到的**词（3 字以上更稳，别抄前一页那句话里的词），不写就拿卡片标题词去找。本技能可独立核对标黄。交给本仓库稳定版引擎时仍填写 `cue.phrases`，标黄字段不会自动升级稳定版跟读能力。精确 `voiceMarks` 需要消费该格式的兼容引擎。`delayMs` 不再使用。用户在「标黄稿」里手动标的位置存在顶层 `DATA.voiceMarks`（构建时不用写，课件里改了会随导出带走）。
- 标签页（chips 版式或 `opts.chips`）里写“键：标签、标签”（键 1–14 字，一行一组），就显示成“键加粗＋标签”（0.4.2，如“交通学院：交通工程、交通运输”）。
- 卡片 `"chips": true`（0.4.1）：只把这张卡说明的第一行拆成标签（专业名单），后面各行照常显示；整段都是名单用页面 `opts.chips`。
- 卡片配图（0.3.9）：卡片加 `"pic": {"src": "相对内容.json的图片路径", "h": 图框高px(120–900), "fit": "contain|cover"}`，构建时压成 WebP 内嵌（写进 DATA 的是 `img` data URL）。见 layouts.md「图片与底图」。

## 标黄（测试版 0.6.0-beta：语音跟读的触发点，规划时写）

```json
{"pages": [
  {"id": "B04", "title": "全省前10名：元培学院",
   "turnYellow": {"seg": "S20", "text": "再往后"},
   "groups": [
     {"id": "B04-g1", "label": "入学", "title": "不分专业", "yellow": {"seg": "S21", "text": "入学不分专业"}},
     {"id": "B04-g2", "label": "第三学期", "title": "全校范围内任选", "yellow": {"seg": "S21", "text": "第三学期"}},
     {"id": "B04-g5", "title": "原稿里没讲到的卡", "yellow": {"follow": true}}
   ]}
]}
```

- `turnYellow`（页）：翻到这一页的触发点，第一页可省（第一页从 0 开始）。`yellow`（卡、高亮）：念到这几个字出这一处。
- `seg`：口播原文段的 id（sourceSegments 里 disposition 以“口播”开头）；`text`：从这段原文**逐字照抄**（标点、数字写法照原文）；可选 `nth`：同一段里第几次出现（默认接着上一处往后找第一次）。`{"follow": true}`：原稿里没讲到，紧跟上一处出。
- 有一处标了黄，就要求每一步都标（或写 follow），漏了构建报错。先后顺序必须和出场顺序一致（页序 → 翻页 → 卡序 → 卡里的高亮）。
- 本技能的 `scripts/yellow.cjs --json` 可换算成 `DATA.voiceMarks`：键 `页id/卡id`、翻页 `页id/_turn`、高亮 `页id/卡id/hN`；值 `{seg, off, len, text}`——off／len／text 都按 voice.js 的 `norm()` 归一后算（逐字 NFKC、小写、中文数字转阿拉伯数字、去标点空白；【】里的字不算）。支持该格式的构建器可将卡片 `cue.phrases` 换成黄底文字，并清理 yellow／turnYellow。本仓库未发布整套测试版引擎，稳定版构建时请显式填写 cue.phrases，不假定会自动内联这些标记。
- 只核对不构建：`node scripts/yellow.cjs 内容.json`；出标黄稿：加 `--draft 标黄稿.html`。

## 规划.json

```json
{
  "schema": "evd-plan/1",
  "deck": {"title": "工具栏与标签页标题", "key": "唯一缓存键-带版本", "exportName": "xxx-我的编辑版.html",
           "backupName": "xxx-内容与样式备份.json", "navLabel": "章节", "newPageTag": "",
           "settings": {"ver": 1, "fs": 1, "theme": "warm", "reduceMotion": false}},
  "defaults": {"design": {"top": 118, "gap": 20, "titleSize": 72, "cardSize": 60, "bodySize": 44, "width": 1472}},
  "nav": [{"name": "第一梯队", "start": "N01"}],
  "pages": {
    "N01": {"layout": "tree", "why": "选这个版式的理由（构建忽略）",
            "design": {"bodySize": 40},
            "opts": {"labelw": 150, "root": true},
            "cells": [[1,1],[1,2],[2,1]]}
  },
  "textFixes": [
    {"id": "N01-g3", "key": "body", "old": "原文（必须完全相同）", "new": "新文"},
    {"id": "N17-g2", "key": "body", "find": "片段", "replace": "替换"}
  ],
  "removeKeys": [{"id": "N02-g2", "key": "highlights"}]
}
```

| 字段 | 说明 |
|---|---|
| deck.key | 浏览器缓存键。新课件新键；同一课件修 bug 不换键；换键前先让用户导出 |
| deck.settings.theme | 骨架配色名：blue / navy / warm / dark / ibmBlue 等（见骨架 `themes`） |
| defaults.design | 全套统一字号层级；页内 `design` 覆盖。只允许 titleSize/cardSize/bodySize/gap/width/top |
| pages.*.layout | 11 种之一，见 layouts.md。每一页都必须有，多写少写都会报错 |
| opts.labelw | rows/tree/steps 的类别标签栏宽 px（按最长标签字数×标签字号≈32 估，80–180） |
| opts.root | tree 第一张卡做母卡 |
| opts.cols / maxWidth / compact | bh 两列卡片：列数、网格最大宽（避开人物框用 1072）、紧凑内边距 |
| opts.chips / rootw / podw / podh | 0.4.0：任意版式把说明拆成标签（chips 版式自带）；htree 根列宽；podium 台宽、台高 |
| opts.together | 任意版式：整页一起出现——翻到该页先只有标题，按一次全部卡片同时出现，再按进下一页（总结页用） |
| cells | bh 等网格版式的格子 [列,行]。bh 的讲解顺序按格子“先列后行”重排（左列从上到下，再右列），所以想要的讲法顺序要按列排格子 |
| nav | 章节导航，start 写页 id |
| textFixes | 措辞修正，逐条断言原文；原文对不上构建即失败（防 v2 那种“挪位置丢全称”） |
| why / cellsNote / 其他 | 分析说明，构建忽略，留给复核 |

字号建议：超密页说明可降到 40 或 36，重点标题保持 60。宽度默认 1472（左右各留 64）；数字田字格常用 1072。
