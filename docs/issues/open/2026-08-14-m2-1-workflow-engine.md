---
title: M2-1 WorkflowEngine 核心（状态机 + artifact 交接 + 审批点）
status: active
created: 2026-08-14
updated: 2026-08-14
kind: feature
priority: high
triage: actionable
areas: [server, data, shared]
depends_on:
  - "docs/issues/close/2026-08-14-m1-project-skeleton.md"
resolution_plan: "docs/plans/open/2026-08-14-m2-1-workflow-engine.md"
---

# M2-1 WorkflowEngine 核心

## 背景

M1 骨架已可运行（前后端 + SQLite + CI），但目前只有占位，没有“工作流”。研镜的核心叙事是“输入研究问题 → 规划 → 检索 → 综述 → 审查 → 审批 → 导出”，这需要一个服务端编排内核：把一次调研组织成一个工作流，把每个阶段组织成角色步骤，用 artifact 交接，在计划与成品两个节点暂停等人类审批。M2-1 就是这个内核。

## 目标

实现 WorkflowEngine：创建/启动工作流、按序执行步骤、产出 artifact、到达审批点暂停、人类审批后继续、记录所有决策；状态变化通过事件订阅对外广播（REST 先行，WS 由后续任务接入）。

## 范围（做）

- `packages/shared`：补充 workflow 生命周期事件类型（沿用现有 ws-protocol 风格）
- `packages/data`：按需补充仓储查询（如按 id 取工作流 + 步骤 + artifact + 决策）
- `apps/server`：
  - WorkflowEngine 状态机：`createWorkflow` / `start` / `advance` / `approve` / `reject`
  - `StepRunner` 接口 + `FakeStepRunner`（M2-1 模拟执行：延时后写 artifact）
  - REST：`POST /workflows`、`GET /workflows/:id`、`POST /workflows/:id/steps/:stepId/decision`
  - 事件订阅：`engine.on(event, cb)`，HTTP 层可转发（先不接 WS）
- 测试：状态机单测（正常流转、审批暂停、reject 终止、artifact 版本递增）、REST API 测试

## 不做（明确排除）

- 真实模型调用（M2-2）
- 学术检索工具（M2-3）
- Writer / Reviewer 语义（M2-4）
- 前端工作流 UI（M2-5）
- WS 真实通道、并发控制、重试/超时、崩溃恢复（后续任务）

## 验收标准

- [ ] `POST /workflows` 创建后返回 `planning` 状态；`start` 后按序执行步骤
- [ ] 步骤完成后自动写 artifact（版本递增），到达审批步骤转为 `awaiting_approval` 并暂停
- [ ] `approve` 继续下一步；`reject` 记录决策并终止工作流；全部步骤完成后 workflow 置 `completed`
- [ ] 每次状态变化触发事件（单测断言订阅回调收到 `workflow.updated` / `step.updated` / `artifact.updated` / `decision.created`）
- [ ] `npm run typecheck` / `npm test` 全绿；runbook 补充 M2-1 接口说明

## 关联

- 依赖：M1 项目骨架（已归档）
- 后续：M2-2 角色运行时接入 pi SDK → M2-3 学术检索 → M2-4 Writer/Reviewer → M2-5 工作流 UI
