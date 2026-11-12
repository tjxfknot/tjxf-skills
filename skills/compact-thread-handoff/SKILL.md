---
name: compact-thread-handoff
description: 线程瘦身 / 压缩线程 / 新线程交接包 workflow. Compress a long, expensive, or context-bloated Codex thread into a concise migration package for a fresh thread. Use when the user says 线程瘦身, 压缩线程, 迁移线程, 开新线程交接包, 省额度迁移, 总结当前线程, or asks to summarize, compact, migrate, fork, continue in a new thread, reduce token or quota burn, preserve progress before leaving a thread, or when repeated tool calls, large outputs, an old resumed thread, task-phase changes, or context compaction indicate that continuing the current thread is becoming inefficient.
---

# 线程瘦身

Create a self-contained handoff that lets a fresh Codex thread resume work without replaying the old conversation.

## Operating rules

- Prefer the context already present. Do not read the full session transcript or scan logs merely to create a handoff.
- Inspect files or state only when a critical fact is missing and one bounded lookup can resolve it.
- Do not continue the original task while preparing the handoff unless the user asks.
- Exclude conversational detours, superseded plans, raw tool output, repeated errors, hidden reasoning, credentials, cookies, tokens, and personal secrets.
- Preserve exact paths, URLs, IDs, branches, commands, schemas, and error messages only when the next thread needs them.
- Distinguish verified facts from assumptions and pending checks.
- Keep the package compact: normally 400-900 Chinese characters or 250-600 English words. Exceed this only when omission would make resumption unsafe.
- If the thread is already missing important context, say what is missing instead of inventing it.

## Workflow

1. Identify the current objective and the concrete completion condition.
2. Capture only durable state:
   - completed work and verified results;
   - current work state;
   - decisions that constrain the solution;
   - files, systems, and external objects still in scope;
   - blockers, risks, and unresolved questions;
   - the smallest next action.
3. Remove history that does not change the next action.
4. Produce the handoff package using the exact output contract below.
5. If the user explicitly asks Codex to create a new thread and a thread-management tool is available, create it with the migration prompt. Otherwise provide a copyable prompt and do not create a thread implicitly.

## Output contract

```markdown
# 新线程交接包

## 目标
<一句话目标，以及完成标准>

## 当前状态
- 已完成：<最多 5 条>
- 进行中：<当前停点>
- 未完成：<最多 5 条>

## 关键事实与决策
- <只保留会影响后续执行的事实、选择及原因>

## 工作对象
- 工作目录/仓库：<路径；不适用则省略>
- 分支/版本：<不适用则省略>
- 关键文件：<路径和用途；不适用则省略>
- 外部对象：<文档、表格、站点、任务或线程 ID；不适用则省略>

## 验证与证据
- <已经运行的检查及结果>

## 风险与待确认
- <明确区分风险、假设和阻塞>

## 下一步
1. <新线程应执行的第一个具体动作>
2. <随后动作；最多 4 步>

## 新线程首条消息
继续下面的任务。先读取这份交接包，不要重新扫描全部历史，也不要重复已完成工作。先核对“当前状态”和“下一步”，发现冲突时以工作区现状为准。

<把上面必要内容压缩成可直接执行的提示词>
```

Omit empty fields. Keep the final `新线程首条消息` independently usable when copied without the surrounding explanation.

## Proactive warning

When this skill is invoked implicitly because a thread appears expensive, begin with one sentence stating the concrete signal, such as repeated large tool round-trips, a resumed old thread, a phase change, or prior compaction. Warn once per task phase, not on every turn.

Do not run quota or transcript diagnostics solely to justify the warning. If the user declines migration, continue normally and wait for a materially stronger signal before warning again.
