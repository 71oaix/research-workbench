---
title: M2-6 工作流多轮迭代与审批（打回修改、逐步检查、反馈注入）（plan）
status: active
created: 2026-08-15
updated: 2026-08-15
issue: 2026-08-15-m2-6-workflow-iteration
areas: [server, data, shared, web]
---

# M2-6 工作流多轮迭代与审批（plan）

## 任务解释

把“通过 / 驳回即取消”的线性审批，改造成“每步检查 + 打回修改 + 带意见重跑”的多轮迭代：默认四步都停下来等人检查；打回时目标步骤及其后续步骤用新版本重跑，上一轮意见注入模型 prompt；取消变成显式的独立操作。

## UI 线框图（审批面板）

```text
┌──────────────────────────────────────────────┐
│ 审批：生成检索计划（01-plan.md v2）           │
│ 修改意见 / 备注：                             │
│ [ 补充“上下文工程”方向的子问题 ]              │
│                                              │
│ [通过]  [打回修改]        [取消任务]（次要）  │
│                                              │
│ 决策历史：                                    │
│  09:01 打回修改：补充上下文工程方向            │
│  08:55 通过：计划可行                        │
└──────────────────────────────────────────────┘
```

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 审批语义 | `approve` = 通过；`modify` = 打回修改（带意见重跑）；`reject` = 显式取消任务 | 只有通过 / 驳回 | 复用现有 DecisionType；符合“研究要迭代”的直觉 |
| 修改目标 | planner / researcher / writer 打回当前步骤；reviewer 打回上一步 writer | 让用户任意选目标步骤 | 线性流程足够；reviewer 本质是审稿，打回应改稿再重审 |
| 重跑范围 | 目标步骤及之后所有步骤置 pending 重跑；之前步骤保持 approved | 只重跑目标步骤 | 下游依赖上游产物，必须随新版本重新生成 |
| 反馈传递 | `steps.pending_feedback` 持久化，随 `StepRunInput.feedback` 注入 prompt，执行后清空 | 内存 Map / 对话外挂 | 重启可恢复；模型明确“先响应上一轮意见” |
| 产物版本 | 重跑生成同名 artifact 新版本（v1 / v2），runner 一律读取最新版本 | 覆盖旧版本 | 保留完整迭代历史，可回看 |
| 默认流程 | 前端四步模板全部 `requiresApproval=true` | 部分自动跑 | 用户要求逐步检查；API 仍支持按步骤配置 |
| 取消 | 仅显式 `reject` 触发 workflow cancelled，UI 作为次要操作 | 打回不再取消 | 修正“驳回=取消”的问题 |

## 实现步骤

1. **shared**：`Step` 增加 `pendingFeedback: string | null`；`StepRunInput` 增加 `feedback?: string | null`。
2. **data**：`steps` 表新增 `pending_feedback TEXT`（沿用 migrate 的 PRAGMA 检查）；repositories 的 map / create / update 支持该字段。
3. **engine**：`decide` 接受 `'approve' | 'modify' | 'reject'`：
   - modify：记录 decision（type=modify, note）→ 计算目标步骤（reviewer 打回 writer，其余打回当前步骤）→ 目标及之后步骤置 pending 并清空其 pending_feedback → 目标步骤写 pending_feedback=note → workflow 置 executing → `runPendingSteps`；
   - reject：保持取消语义；
   - `runPendingSteps`：`StepRunInput.feedback = step.pendingFeedback`，步骤执行后清空。
4. **最新产物读取**：新增 `apps/server/src/artifacts.ts` 的 `findLatestArtifact(artifacts, name)`（按 version 最大）；PiStepRunner 与 EvidenceStepService 全部改用最新版本。
5. **runtime**：`buildStepPrompt` 在 feedback 非空时增加“上一轮修改意见”小节；角色提示词补充“如有修改意见先响应”；researcher 分支读取最新 01-plan。
6. **MockStepRunner**：输出中体现“已按意见修订：<feedback>”，便于演示迭代。
7. **web**：`DEFAULT_STEPS` 四步全 `requiresApproval=true`；ApprovalPanel 改为通过 / 打回修改（意见必填可选）+ 取消任务（次要）+ 决策历史；store `decide` 支持 `modify`；ArtifactTabs 标签显示 `name (vN)`。
8. **verify 脚本**：更新 verify-m2-3 / m2-4 为逐步审批；新增 `scripts/verify-m2-6.mjs` 演示一次打回（planner 打回后再次审批），断言产物版本 ≥ 2 且 completed。
9. **测试与文档**：见下方清单。

## 测试方案

- **engine**：
  - modify 后目标及后续步骤重跑并再次暂停；
  - planner 打回产生 01-plan.md v2；
  - reviewer 打回 → writer / reviewer 重跑；
  - reject 仍取消；feedback 随 StepRunInput 传递并在执行后清空。
- **data**：`pending_feedback` 迁移与读写。
- **runner**：最新版本 artifact 选择；feedback 注入 prompt。
- **api**：decision 接受 modify。
- **web**：面板三操作、决策历史、默认四步审批、产物版本标签。
- **手动**：普通模式跑一轮，打回计划 → 再次审批 → 完成。
- **CI**：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：状态机与决策语义（modify 打回循环）。
- `docs/architecture/03-data-model.md`：`steps.pending_feedback` 字段说明。
- `docs/guide/runbook.md`：审批操作说明（通过 / 打回修改 / 取消任务）。
- `docs/INDEX.md`：登记 M2-6 issue / plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-15
- 审查视角：迭代闭环、反馈不丢失、版本一致性、误操作防护
- 发现与处理：
  - [major] reviewer 打回目标 = writer，必须同时重置 writer 与 reviewer → 已写入关键决策与步骤 3；
  - [major] 重跑时下游步骤必须重置，否则旧产物状态残留 → 已写入重跑范围；
  - [minor] 反馈持久化到 steps 表而非内存，重启可恢复 → 已写入反馈传递；
  - [minor] 迭代时若仍读旧版本产物，修改等于白做 → 新增 findLatestArtifact 统一处理；
  - [minor] 取消仍保留但改为显式次要操作，避免误触 → 已写入 UI 与决策表。

## 涉及 UI

审批面板与产物标签有 UI 改动，已提供线框图；实现时保持“可用优先”。

## 实现 review

- 日期：2026-08-15
- 审查方式：类型检查 + 单测 + 演示模式冒烟
- 结果：typecheck 全绿；server 53 个测试 + data 4 个 + web 6 个通过；DEMO 冒烟：打回后 01-plan.md 生成 v2，逐步审批至 completed
- 与 plan 的偏差与发现：
  - [major] 迭代重跑必须读取最新产物版本，否则修改等于白做 → 新增 `findLatestArtifact` 并在 researcher / evidence 分支统一使用；
  - [minor] Step 类型新增 `pendingFeedback` 后，前端与 runner 测试夹具需同步补齐字段；
  - [minor] verify-m2-3 / m2-4 改为逐步审批，新增 verify-m2-6 演示一次打回闭环；
  - [minor] 打回按钮在未填写意见时禁用，避免空反馈重跑。
