---
name: long-job-monitor
description: 长任务监控与自愈 workflow. Use when a user asks to keep an eye on progress, create/check an automation or heartbeat, monitor a long-running job, batch process, crawler, downloader, transcription job, deployment, training run, or background script; especially when status may repeat, a process may be stuck, no process is running but work remains, or low-cost periodic checks are needed. Avoids repetitive token-burning updates by detecting state changes, stalls, completion, and escalation points.
---

# 长任务监控与自愈

## 核心原则

监控不是定时复读。每次检查都要判断状态是否变化、任务是否仍在运行、是否需要行动。

默认低成本：只读必要计数、进程状态、最后一小段结构化日志。不要读取大段日志，不重复解释历史。

## 状态模型

每次检查至少记录：

- 当前完成数、总数、失败数、剩余数。
- 剩余对象标识，例如行号、文件名、任务 ID。
- 相关进程 PID 和命令。
- 最后进展时间或最后完成对象。
- 与上一次检查相比是否变化。

## 决策规则

如果有进展：一句话汇报当前状态。

如果连续 2 次无进展但进程仍在：判断可能卡住，检查最后处理对象和少量错误日志。

如果无进程但仍有剩余：明确说需要续跑，不再每次重复同一句；用户未要求续跑时不要自动启动。

如果完成：汇报完成，并建议删除或暂停自动化。

如果失败数增加：提示需要清理或重试，并给出失败对象数量。

## 汇报格式

使用固定格式：

`进度：已完成 257/258，剩余数量 1，剩余对象 [163]，失败 0；进程：运行中。`

避免含糊表达，尤其要区分数量和编号。

## 自动化退出条件

当任务完成、连续多次无变化且不能自动处理、或用户已明确暂停时，更新或删除 heartbeat 自动化。不要让自动化长时间刷同一句。

## 适用场景

批量转录、爬虫、下载、OCR、LLM 批处理、模型训练、部署、数据导入、批量文件转换。
