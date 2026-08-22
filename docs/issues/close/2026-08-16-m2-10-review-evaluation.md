---
title: M2-10 审查与评估（concern ledger + evaluation-report + UI）
status: archived
created: 2026-08-16
updated: 2026-08-16
kind: feature
priority: high
triage: actionable
areas: [server, shared, web]
depends_on:
  - "docs/issues/open/2026-08-16-m2-9-citation-verification.md"
resolution_plan: "docs/plans/open/2026-08-16-m2-10-review-evaluation.md"
---

# M2-10 审查与评估

## 背景

reviewer 输出是自由文本，无法结构化判断阻断项、依据与解决条件；也没有客观的调研质量指标。本任务把审查结构化为 concern ledger，并生成 evaluation-report 供 UI 展示与人工决策。

## 目标

- reviewer 输出结构化 concern ledger（severity / blocking / claim / evidence / resolution）
- 自动生成 evaluation-report（主题匹配门禁、相关度、大纲覆盖、来源失败）
- UI 展示关键指标，并提供“打回 Writer 并附审查意见”一键操作

## 范围（做）

- reviewer：concern ledger 结构，无证据不推断（`Not assessable`）
- evaluation-report：主题匹配门禁 + 相关度分 + 大纲覆盖 + 来源失败统计
- UI：右侧证据面板展示指标；Reviewer 步骤“打回 Writer 并附审查意见”按钮

## 不做

- 六维完整评分与 gap 分析（留 M3）
- 多审查者隔离执行（留 M3）
- UI 视觉打磨

## 验收标准

- [ ] reviewer 输出含 concern ledger 五要素
- [ ] evaluation-report 含主题匹配门禁、相关度、大纲覆盖、来源失败
- [ ] UI 展示关键指标；一键打回 Writer 附带审查意见
- [ ] typecheck / test 全绿

## 关联

- 依赖：M2-9
