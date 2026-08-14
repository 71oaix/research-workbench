---
title: M2-1 WorkflowEngine 核心（plan）
status: active
created: 2026-08-14
updated: 2026-08-14
issue: 2026-08-14-m2-1-workflow-engine
areas: [server, data, shared]
---

# M2-1 WorkflowEngine 核心（plan）

## 任务解释

在 M1 骨架上实现服务端工作流内核：创建 → 执行 → 审批暂停 → 继续/终止 → 完成，步骤间用 artifact 交接，状态变化通过事件广播。不接真实模型，用假执行器把状态机完整跑通，为 M2-2～M2-5 提供可替换的执行底座。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 引擎形态 | `apps/server/src/engine` 独立模块，构造注入 repos + stepRunner + eventBus | 逻辑塞进 Hono handler | 与 HTTP 解耦，单测友好，M2-2 换真实 runner 不动接口 |
| 事件总线 | `node:events` EventEmitter + 类型化封装 | 自研 pub/sub、第三方库 | 零依赖；后续 WS 层监听同一总线即可 |
| 审批点 | 步骤显式 `requiresApproval` 字段 | 按角色硬编码 | 灵活；planner / final 两个审批点由工作流定义控制 |
| 执行器 | `StepRunner` 接口 + `FakeStepRunner`（约 200ms 延时，产出引用输入 artifact 的模拟 markdown） | 直接写死逻辑 | 交接链路可验证；M2-2 替换为 pi SDK runner |
| 步骤顺序 | 显式 `position` 字段 | 依赖 created_at 排序 | 同一毫秒插入多条时 created_at 不稳定 |
| 状态流转 | 顺序执行；approve 前进、reject 终止 | 并行、重试、超时、恢复 | M2-1 聚焦最小闭环，复杂度留给后续任务 |
| API 形态 | REST JSON + 事件订阅（先不接 WS） | WS 先行 | 简单可测；真实 WS 由 M2-5 接入 |

## 状态机

```text
create → planning
start  → executing
  顺序执行步骤（pending → running → runner 产出 artifact）：
    ├ requiresApproval=false → approved → 下一步
    └ requiresApproval=true  → awaiting_approval（workflow: paused）
approve → step approved → 有下一步则执行，否则 workflow: completed
reject  → step rejected → workflow: cancelled（记录 decision）
```

## 接口设计

- `POST /workflows`：body `{ goal, steps: [{ label, role, requiresApproval }] }` → 201 workflow
- `POST /workflows/:id/start`：开始执行；已执行过返回 409
- `GET /workflows/:id`：返回 `{ workflow, steps, artifacts, decisions }`
- `POST /workflows/:id/steps/:stepId/decision`：body `{ type: 'approve' | 'reject', note? }`；步骤不在 `awaiting_approval` 时返回 400
- 事件：`workflow.created` / `workflow.updated` / `step.updated` / `artifact.updated` / `decision.created`（类型在 shared）

## 实现步骤

1. **shared**：新增 `StepSpec` 类型（label / role / requiresApproval）与 `workflow.created` 事件
2. **data**：steps 表增加 `position` 列；`StepRepository.create` 接受并写入 position（开发库无价值数据，直接重建 `data/app.db`）
3. **server/src/engine**：
   - `eventBus.ts`：EventEmitter 类型化封装
   - `WorkflowEngine.ts`：create / start / advance / decide，组合现有仓储
   - `StepRunner.ts`：接口 + FakeStepRunner（延时后生成 markdown，内容引用输入 artifact 以验证交接）
4. **server/src/index.ts**：创建 engine 实例并挂 REST 路由
5. **测试**：`engine.test.ts`（状态机 + 事件）+ `api.test.ts`（REST）
6. **文档**：架构文档补 WorkflowEngine 小节、runbook 补接口说明、INDEX 登记 plan

## 测试方案

- **engine 单测**：创建 → planning；start → 步骤流转；requiresApproval 暂停；approve 走完全流程；reject 终止并记录 decision；事件订阅断言收到 5 类事件
- **API 测试**：4 个端点 happy path + 400（非法 decision）/ 404（不存在）/ 409（重复 start）
- **手动验证**：curl 跑一个四步工作流（planner 审批 → researcher 自动 → writer 自动 → reviewer 审批 → completed）
- **CI**：typecheck + test 全绿

## 文档更新清单

- `docs/architecture/02-system-architecture.md`（补 WorkflowEngine 组件与状态机）
- `docs/guide/runbook.md`（补 M2-1 接口示例）
- `docs/INDEX.md`（登记本 plan）

## 独立 review

> 子 agent 通道不可用，由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-14
- 审查视角：状态机完整性、可测试性、数据一致性
- 发现与处理：
  - [major] 步骤顺序依赖 `created_at` 在同毫秒插入时不稳定 → 增加显式 `position` 字段
  - [major] 现有开发库 schema 不会自动加列 → 开发期直接重建 `data/app.db`（无价值数据；正式迁移留给后续任务）
  - [minor] decision 作用于非 `awaiting_approval` 步骤需返回 400；重复 start 返回 409 → 已写入接口设计
  - [minor] FakeStepRunner 产物必须引用输入 artifact，才能验证交接链路 → 已写入实现步骤 3

## 不涉及 UI

本任务纯后端，不涉及 UI，按 artifacts 硬性要求无需线框图或 HTML 预览。
