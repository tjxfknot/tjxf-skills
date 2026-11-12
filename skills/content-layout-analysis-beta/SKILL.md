---
name: content-layout-analysis-beta
description: 测试版内容规划：从口播原文标出翻页、出卡和高亮触发词，独立校验顺序与原文命中并生成标黄稿；附本地校验脚本，不需要整套测试版课件引擎。
---

# 内容呈现分析与标黄规划（测试版）

将用户提供的原稿拆成页面、重点、版式和触发词，先检查“哪句话对应哪张卡”。本包独立提供标黄校验和 HTML 稿生成，不连接文档服务、不上传原稿。

## 规划与核对

1. 为原稿每段分配稳定 id，记录上屏、口播、备注或删除理由，保留原文去向。内容关系见 [decision-rules.md](references/decision-rules.md)。
2. 输出内容与规划 JSON，字段见 [plan-schema.md](references/plan-schema.md)，版式见 [layouts.md](references/layouts.md)。口播段写入 sourceSegments，screenId 对齐页 id。
3. 每张卡写 `yellow: {seg: "段落id", text: "逐字原文"}`；翻页用 turnYellow，高亮可各有 yellow。原文没讲到的动作写 `{follow: true}`。先后顺序只向前，相同词可用 nth 区分。不得为匹配而改写用户原稿。
4. 在本技能目录运行下方命令，核对所有错误并复核警告，再将标黄稿交给用户。该文件含原文，不能自动发布。
5. 容量粗估使用 `python3 scripts/capacity_check.py 规划.json 内容.json`；先调整分页与版式，再调字号。系统字体在不同设备上可能换行不同，最终课件需浏览器实测。

```bash
node scripts/yellow.cjs assets/examples/demo/content.json --json
node scripts/yellow.cjs assets/examples/demo/content.json --draft 标黄稿.html --plan assets/examples/demo/plan.json
```

## 与稳定版课件配合

本仓库只发布了用户选中的稳定版 `editable-video-deck`。需要实际构建时交给该技能，另行填写卡片的 `cue.phrases`，逐字取自同页口播原文。稳定版按自身的 cue 跟读逻辑运行，不会自动获得测试版的精确 voiceMarks 构建能力。

标黄 JSON 和原文定位报告可独立查看或交给支持该格式的其他引擎；本技能不附未选中的 editable-video-deck-beta，也不声称该引擎已安装。标黄工具中的归一函数来自本集合课件跟读源码，现独立放在 `scripts/voice-normalize.cjs`，与其余文件一起复制即可运行。

事实矛盾、出处和缺口仍需另行核查；规划不能替代内容核实。无浏览器工具时只交付规划与标黄稿，不声称最终页面已验收。
