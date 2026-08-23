---
title: BUG-1 无 Writer 模式下六维评分失真 + Reviewer 打回文案错误
status: active
created: 2026-08-23
updated: 2026-08-23
kind: bug
priority: high
triage: needs-plan
areas: [server, web]
---

# BUG-1 无 Writer 模式下六维评分失真 + Reviewer 打回文案错误

## 背景

用户用**六步模板（无 Writer）**跑"研究下RAG的使用"，图 6 出现：

- 六维评分：相关度 0（高0/部分0）、引用可信 0（草稿去重引用 0/24 卡）、大纲覆盖 0（覆盖0/8章）、
  完整性 0（未覆盖 8 章）——因为无草稿，确定性六维把"大纲覆盖/引用可信/完整性"全按草稿空算成 0；
- 审批卡按钮显示"打回 Writer"，但六步模板根本没有 Writer 角色，实际打回目标应回退为 Reviewer 自身重跑，
  文案与行为不符。

根因：六维评分未适配"无 writer"口径（应改按证据池覆盖）；Reviewer 打回按钮文案未判断"无 writer 模板"。

## 目标

1. 无 Writer 模板下六维评分按**证据池覆盖**口径（大纲覆盖用"计划章节 vs 卡片主题分组/分级"，
   引用可信用"卡片可核验/覆盖"而非草稿引用，完整性用"未覆盖的计划章节"），避免全 0 失真；
2. 无 Writer 模板下 Reviewer 打回按钮文案为"打回重跑"（或"打回修改"），且行为确实是回退自身重跑。

## 范围（做）

- `computeSixDimScores`：draft 为空时用证据池覆盖口径计算（大纲覆盖/引用可信/完整性）；
- ApprovalPanel / modifyTarget：无 Writer 时 Reviewer 打回文案与行为一致（自身重跑）。

## 不做

- 不改六维规则口径之外的东西；不改评估/审查提示逻辑。

## 验收标准

- [ ] 无 Writer 模板下六维评分不再全 0，能反映证据池覆盖；
- [ ] 无 Writer 模板下 Reviewer 打回按钮不显示"打回 Writer"，且回退自身重跑；
- [ ] 现有测试更新后全绿。
