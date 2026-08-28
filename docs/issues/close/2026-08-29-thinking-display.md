---
title: 思考过程展示（thinking 块验证先行）
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: feature
priority: medium
triage: planned
areas: [server, web]
depends_on:
  - "docs/issues/open/2026-08-29-streaming.md"
---

# 思考过程展示

## 背景
thinkingLevel 已在 piConfig 配置，但思考内容不可见。Claude 的"灰色斜体思考块（实时滚动→折叠为已思考 N 秒）"是最被认知的 agent 视觉语言。**前提：DeepSeek v4-flash 是否返回 thinking 块未验证**。

## 目标
探针验证 → 有 thinking 块则经 `step.stream{kind:'thinking'}` 展示；无则归档本 issue 记录原因，Plan artifact-collapse 的 shimmer 为最终态。

## 范围（做）
1. 探针：真跑 planner 一步，dump partial message 的 content 块类型与样本；
2. 有 thinking：`send()` 差分 thinking 增量 → store 双缓冲 → 气泡内浅色斜体块实时滚动（自动滚底），结束折叠为"已思考 N 秒"；
3. 无 thinking：归档并文档记录。

## 不做
- 跨模型 thinking 兼容矩阵；thinking 全文持久化入库。

## 验收标准
- [ ] 探针结论入档（截图/样本）；
- [ ] 有块：实时滚动 + 折叠计时；无块：优雅降级不报错；
- [ ] 渲染组件三态单测；typecheck / test 全绿。
