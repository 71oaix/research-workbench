---
title: 修复澄清计划审批卡死（通过不完整计划导致 researcher 失败 / step_not_found）
status: active
created: 2026-08-23
updated: 2026-08-23
kind: bug
priority: high
triage: needs-plan
areas: [server, web]
---

# 修复澄清计划审批卡死（通过不完整计划导致 researcher 失败 / step_not_found）

## 背景

宽泛问题（如"研究下什么是 agent"）时 planner 会输出"澄清请求"（计划无"检索关键词/子问题"小节）并停在审批。
实测复现：

- 用户在审批卡直接点"通过"（不回答澄清）→ 引擎把不完整计划 approved → 下一步 researcher 报
  `01-plan.md 未找到"检索关键词"或"子问题"小节`（HTTP 500）→ 工作流置 failed；
- 正确做法是"打回修改"（把答案写进意见，Planner 重跑生成完整计划），但当前 UI 允许用户点"通过"，
  且若误点后工作流进入"规划待审批 + 检索失败"的矛盾状态，前端历史审批卡可能再用旧 stepId 触发
  `step_not_found`（404），呈现失败横幅。

根因：澄清计划本就不该被"通过"（它不完整）；决策失败后前端不自动对账，导致界面停留在过期审批态。

## 目标

1. 需要澄清时，前端**禁用"通过"**，引导用户用"打回修改"提交回答并重新规划；
2. 任何决策请求失败（`step_not_found` / `step_not_awaiting_approval` 等）时，前端**自动对账刷新**，
   清除过期审批卡与错误横幅，让工作流回到真实状态。

## 范围（做）

- `ApprovalPanel`：`clarification` 存在时禁用"通过"，打回按钮文案改为"提交回答并重新规划"；
- `store.decide`：catch 到决策错误时调用 `refreshList()` 对账（重置 detail/workflows）。

## 不做

- 改引擎对未来一次澄清计划的 approve 语义（靠前端禁用 + 引导即可）；
- 重构澄清/重规划状态机（超出本次 bug 范围）。

## 验收标准

- [ ] 澄清审批卡上"通过"不可点，"打回修改"需填写回答后才可点；
- [ ] 决策失败（含 step_not_found）后前端自动刷新，不再停留在过期审批卡；
- [ ] 原 500 复现路径（澄清→通过）不再发生（通过被禁用）；
- [ ] 现有 web 测试仍全绿。
