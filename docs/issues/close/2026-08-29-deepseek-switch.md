---
title: 切换 DeepSeek 官方 API
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: infra
priority: high
triage: actionable
areas: [server]
---

# 切换 DeepSeek 官方 API

## 背景
用户实测反馈（2026-08-29）：opencode-go → api.deepseek.com（pi-ai 内置 deepseek thinkingFormat 一等支持）。

## 目标与结果
opencode-go → api.deepseek.com（pi-ai 内置 deepseek thinkingFormat 一等支持）；env 改 DEEPSEEK_API_KEY；provider 默认 deepseek；模型名不变；cost 表更新为官方非峰值价；探针真跑验证 thinking/流式正常

## 验收（全部通过）
- [x] typecheck 全绿；全仓 199 测试通过（+2 cancel 用例）
- [x] 真实工作流端到端验证（DeepSeek 官方 API 上）
- [x] 取消链路：运行中取消 → 8 秒内步骤 skipped、零半成品、状态 cancelled
