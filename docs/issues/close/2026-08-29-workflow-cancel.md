---
title: 工作流取消（停止按钮）
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: feature
priority: high
triage: actionable
areas: [server, web]
---

# 工作流取消（停止按钮）

## 背景
用户实测反馈（2026-08-29）：engine.cancel 置标志 + session.abort 中断活跃流。

## 目标与结果
engine.cancel 置标志 + session.abort 中断活跃流；runner 关键节点 isCancelled 检查点（补 abort 窗口错过的盲区）；被取消步骤 skipped、半成品丢弃、不可重启；POST /workflows/:id/cancel（仅 executing）；前端头部停止按钮（红调，单击即停）

## 验收（全部通过）
- [x] typecheck 全绿；全仓 199 测试通过（+2 cancel 用例）
- [x] 真实工作流端到端验证（DeepSeek 官方 API 上）
- [x] 取消链路：运行中取消 → 8 秒内步骤 skipped、零半成品、状态 cancelled
