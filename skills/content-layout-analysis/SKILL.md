---
name: content-layout-analysis
description: 阅读原稿、拆分页面与重点、按内容关系选择版式、估计容量，输出可供 editable-video-deck 构建的规划和内容 JSON。用于做课件前的分页和版式规划，不代替事实核查。
---

# 内容呈现分析

把“原稿怎么讲”整理为“哪页显示什么、每次出现哪条”的可检查规划。保留原文去向，提前发现容量和出处缺口。输入是用户提供的文字、表格或课件 DATA；不自动连接文档服务，也不上传原稿。

## 工作流程

1. 原稿每段分配稳定 id，记录上屏、口播、备注或删除理由。尊重用户已有分页；确实装不下时提出拆页方案并记录假设。
2. 每页拆出可单独讲解的重点，一个重点对应一张卡。内容关系决定版式，见 [decision-rules.md](references/decision-rules.md)。版式能力与字段以同级 `editable-video-deck/references/layouts.md` 和 `plan-schema.md` 为准。
3. 输出 `内容.json`：pages/groups 正文与 sourceSegments/cue 原稿映射。`screenId` 与页 id 对齐，cue 只用本页原文词。输出 `规划.json`：deck、defaults、pages 的 layout/design/opts/cells、nav 和 textFixes。不要在换版式时改原文，需要改字就用原文断言。
4. 容量粗估：从此 SKILL.md 所在目录运行 `python3 scripts/capacity_check.py 规划.json 内容.json`。警告先检查拆页、换版式与行长，再调字号。公共版使用系统字体，估计误差取决于设备，定稿要在浏览器实测。
5. 给用户规划表：页、重点、版式、原因、容量、待核；同时核对每段原稿的去向、条目数和字段空缺。原稿矛盾不猜填；缺出处标 `【待核】`。用户已授权直接推进时记录假设，不增加无必要审批。
6. 交给同级 `editable-video-deck` 构建并按其 SKILL.md 验证。路径从当前技能目录定位，例如 `../editable-video-deck/scripts/build_deck.py`；技能不是同级安装时先定位实际目录。

可运行的通用合成输入在 `../editable-video-deck/assets/examples/demo/`。本公共版不包含原作者学校项目、原稿截图或真实业务案例。

纯报告/看板也可使用内容关系表给形式建议；本技能只做规划，具体实现由用户选择工具。未经用户提供或核查的事实不补成看似完整的数据。
