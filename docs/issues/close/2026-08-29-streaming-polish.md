---
title: 流式体验打磨
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: ux
priority: high
triage: actionable
areas: [server, web]
---

# 流式体验打磨

## 背景
用户实测反馈（2026-08-29）：帧距 80→40ms。

## 目标与结果
帧距 80→40ms；流式正文自动滚底+max-height；轮换文案停留 3s→6s、淡入 400ms、追加（Ns）步骤计时；流式预览显示条件收紧（主产物已存在且非打回 → 不显示，消除候选池与实时输出的内容重复观感）

## 验收（全部通过）
- [x] typecheck 全绿；全仓 199 测试通过（+2 cancel 用例）
- [x] 真实工作流端到端验证（DeepSeek 官方 API 上）
- [x] 取消链路：运行中取消 → 8 秒内步骤 skipped、零半成品、状态 cancelled
