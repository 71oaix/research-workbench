---
title: 真流式输出（pi message_update → WS step.stream → 前端流式渲染）
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: feature
priority: high
triage: planned
areas: [server, web, shared]
---

# 真流式输出

## 背景
`PiRuntimeHandle.send()` 整轮 `await session.prompt()` 后一次性抽全文，产物整块下发——演示缺乏"AI 正在写"的核心观感。pi SDK 的 `message_update` 增量事件与 `session.subscribe()` 现成可用，只差封装层。

## 目标
模型输出经节流后逐段流到前端气泡内（~80ms 批次 + 尾部光标），产物落库时全量兜底替换，断线安全。

## 范围（做）
- `PiRuntimeHandle.send(prompt, onDelta?)`：订阅 `message_update`，全量差分出 text 增量（80ms 节流）；
- shared 协议新增 `step.stream {workflowId, stepId, kind:'text'|'thinking', delta, seq}`；
- PiStepRunner / MockStepRunner 透传；index.ts 装接到 bus；
- store 按 stepId 缓冲增量，artifact.updated 到达清缓冲并全量替换；
- 流式渲染异常自动回退整块模式（零回归保底）。

## 不做
- 流续传/seq 重传（断线走现有对账机制）；summarizer（确定性步骤，无流式）；检索工具内部流。

## 验收标准
- [ ] 真实工作流 writer 输出可见逐段流出；
- [ ] WS 重连后产物完整不丢；
- [ ] 增量异常自动回退；既有 196 测试零回归；
- [ ] delta 差分/节流/store 缓冲有单测。
