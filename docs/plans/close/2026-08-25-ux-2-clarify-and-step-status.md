---
title: UX-2 澄清审批交互与步骤状态显示（plan）
status: archived
created: 2026-08-25
updated: 2026-08-25
issue: "docs/issues/open/2026-08-23-ux-clarify-and-step-status.md"
areas: [web]
---

# UX-2 澄清审批交互与步骤状态显示（plan）

## 任务摘要
澄清计划不再放行"通过"（直接去掉按钮而非禁用），并把步骤状态标签严格对齐到实际 status，避免"已通过仍显示待你审批"。

## 为什么做
- 澄清计划不完整（无"检索关键词/子问题"），点"通过"会把不完整计划放行，导致 researcher 失败（实测复现过 500）；
- 用户反馈：既然不能通过，就**直接取消"通过"按钮**，而不是禁用；
- 图 2：第一步已通过/进行中，但步骤仍显示"待你审批/需审批"，与实际不符，用户困惑。

## 预计效果
- 澄清卡上没有"通过"按钮，只剩"提交回答并重新规划 / 取消任务"；
- 步骤状态标签严格按 `step.status` 渲染（approved→已通过、awaiting→待你审批、running→进行中、failed→失败），不再有与状态无关的"需审批"残留。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 澄清时的通过 | 直接**不渲染**"通过"按钮 | 保留但 disable | 用户明确要"取消掉"，隐藏更清晰 |
| 步骤徽章 | 严格按 `step.status` 单一来源 | 额外显示"需审批" | 避免与状态冲突误导 |
| 状态工具 | StepTimeline 内统一 `statusText`/`visualState` | 分散判断 | 一处维护，避免不一致 |

## Review 发现与修正
- [major] 只改按钮不改步骤状态，图 2 的"待你审批"残留依旧 → 修正：同时重构 StepTimeline 状态标签，approved 绝不再出现"待你审批"。
- [minor] 隐藏"通过"后，澄清卡需明确引导 → 修正：澄清提示文案已说明用"提交回答并重新规划"；保留"取消任务"。
- [minor] 隐藏通过会对现有"澄清禁用通过"测试造成断言变化 → 修正：把测试改为"无通过按钮"。

## 实现步骤
1. `ApprovalPanel`：`needsClarification` 时不渲染"通过"按钮；
2. `StepTimeline`：`statusText`/`visualState` 严格按 `step.status`；移除"已通过/进行中"步骤上的"需审批"徽章；
3. 更新测试：澄清卡无"通过"按钮；approved 步骤标签为"已通过"。

## 测试与验证
- web 单测：澄清卡无"通过"、有"提交回答并重新规划"；StepTimeline 各状态标签正确；
- 复现：`npm run typecheck --workspace @research-workbench/web && npm test --workspace @research-workbench/web`。

## 验收标准
- [ ] 澄清卡不渲染"通过"按钮；
- [ ] 已通过步骤显示"已通过"，不再有"待你审批/需审批"；
- [ ] web 测试全绿。

## 文档更新清单
- `docs/guide/runbook.md`：审批交互说明（澄清时用"提交回答并重新规划"）。

## 涉及 UI/预览
审批卡 + 步骤时间线；本地 `http://localhost:5173`。
