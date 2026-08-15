---
title: M2-5 工作流 UI（列表、步骤时间线、产物预览、审批、实时事件）（plan）
status: active
created: 2026-08-14
updated: 2026-08-14
issue: 2026-08-14-m2-5-workflow-ui
areas: [web, server, shared]
---

# M2-5 工作流 UI（plan）

## 任务解释

把 M1 的三栏占位页升级为可操作的工作台：左侧管理研究工作流，中间看步骤推进、读每步产物、做审批，右侧看证据与引用摘要；所有状态变化通过 WebSocket 实时推送。同时提供 DEMO_MODE 演示模式，不依赖模型 key 也能跑通完整演示。

## UI 线框图

```text
┌────────────────────────────────────────────────────────────────┐
│ 研镜 Research Workbench                           [WS 已连接]   │
├──────────────┬─────────────────────────────────────────────────┤
│ 工作流列表    │ 详情：研究问题 + 步骤时间线                      │
│ + 新建        │  ● Planner ✓ → ● Researcher ✓ → ● Writer ✓     │
│  ▪ 任务A 进行 │  → ● Reviewer 待审批                            │
│  ▪ 任务B 完成 │  [产物标签] 01-plan | cards | 02-research |     │
│               │   lint | draft | review                        │
│               │  内容预览（Markdown 原文）                      │
│               │  [审批面板] 通过 / 驳回 + 备注                  │
├──────────────┴─────────────────────────────────────────────────┤
│ 证据 / 引用摘要：检索 99→87、失败源、引用检查 有效 / 越界        │
└────────────────────────────────────────────────────────────────┘
```

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| WebSocket 实现 | `ws` 包直接挂在 @hono/node-server 的 HTTP server 上（path `/ws`），事件总线广播 JSON | Hono 的 upgradeWebSocket helper | @hono/node-server 1.19 未内置 WS 适配，`ws` 方案稳定且测试可控 |
| 状态管理 | Zustand 单一 store（workflows / selected / wsStatus），REST 初始化 + WS 增量更新 | 组件本地 state / React Query | MVP 技术栈定稿为 Zustand；事件 upsert 简单直接 |
| 列表端点 | server 新增 `GET /workflows`（workflows.list 精简字段） | 前端只存本地 | 刷新后列表可恢复，也是后续页面基础 |
| 产物预览 | 标签页切换 + Markdown 原文展示 | Markdown 渲染库 / 编辑 | MVP 看内容即可，渲染与编辑留 M3 |
| 审批交互 | 仅 `awaiting_approval` 步骤显示面板，approve / reject + 备注 | 审批历史单独页 | 保持流程线性，决策记录已有 API |
| 演示模式 | `DEMO_MODE=1` 时用 MockStepRunner（注入 repos + bus），产出合规产物序列（含 research-cards.md / citation-lint.md） | 复用 FakeStepRunner / 真实模型 | 竞赛与 UI 验收不依赖 key，且产物结构完全一致 |
| WS 断线 | 客户端自动重连（3 s 退避），断线状态显示在标题栏 | 队列补发 | MVP 足够；事件可从 REST 重新拉取兜底 |
| 实时范围 | workflow / step / artifact / decision / search.completed / usage | paper.created / error 也推 | 先覆盖 UI 需要的核心事件，其余事件照常广播 |

## 实现步骤

1. **server 依赖**：`apps/server` 安装 `ws` 与 `@types/ws`。
2. **server WS**：`apps/server/src/ws.ts` 改为 `attachWebSocket(bus, server)`：`new WebSocketServer({ server, path: '/ws' })`；连接后发送 `{ type: 'hello' }`；`bus.on` 向所有客户端广播 `ServerEvent` JSON；关闭时清理监听。
3. **server 列表端点**：`index.ts` 增加 `GET /workflows`，返回 `repos.workflows.list()`（id / goal / status / created_at / updated_at）。
4. **server 装配**：`serve` 返回值拿到 HTTP server 后调用 `attachWebSocket`；`DEMO_MODE === '1'` 时用 `MockStepRunner`，否则保持 PiStepRunner。
5. **MockStepRunner**：`apps/server/src/runtime/MockStepRunner.ts`（注入 repos + bus）：planner 输出 `01-plan.md`（含“检索关键词”），researcher 输出 `02-research.md` 并补建 `research-cards.md`，writer 输出 `03-draft.md`（含 [1]-[5] 引用与参考文献），reviewer 输出 `04-review.md` 并补建 `citation-lint.md`；按步骤 role 映射 ARTIFACT_NAMES。
6. **web 依赖**：`apps/web` 安装 `zustand`。
7. **web api**：`src/api.ts` 封装 `listWorkflows / createWorkflow / startWorkflow / getWorkflow / decide`。
8. **web store**：`src/store.ts`：state（workflows、selectedId、detail、wsStatus、error）；actions（refreshList、createWorkflow、selectWorkflow、startWorkflow、decide、applyServerEvent、connectWs）；事件按 workflowId upsert。
9. **web 组件**：`WorkflowList`（新建 + 列表）、`StepTimeline`、`ArtifactTabs`、`ApprovalPanel`、`EvidencePanel`（解析 search.completed 统计与 citation-lint.md 摘要）。
10. **App 组装**：三栏布局接入 store；`useEffect` 中 refreshList + connectWs；vite.config 增加 `/ws` 代理（`ws: true`）。
11. **测试与文档**：见下方清单。

## 测试方案

- **server**：
  - `GET /workflows` 返回列表（api.test 扩展）；
  - WS 集成：起真实 server（端口 0），ws 客户端连接后创建并启动工作流，断言收到 workflow.created / step.updated / artifact.updated 事件；
  - MockStepRunner：产物名与内容结构（含 research-cards.md / citation-lint.md）、审批步骤 pause。
- **web**：
  - store：mock fetch，创建 / 选择 / 审批动作与 applyServerEvent 的 upsert 逻辑；
  - App：mock fetch + 假 WebSocket，渲染列表、选择详情、审批按钮触发 POST。
- **手动**：`npm run dev` 后浏览器操作全流程；`DEMO_MODE=1 npm run dev` 无 key 演示。
- **CI**：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：新增“工作流 UI 与 WebSocket（M2-5）”小节（端点、WS 广播、store、演示模式）。
- `docs/guide/runbook.md`：新增 M2-5 启动与验证（普通模式 / DEMO_MODE、WS 说明）。
- `docs/INDEX.md`：归档 M2-4 issue / plan，登记 M2-5 issue / plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-14
- 审查视角：实时性、演示可用性、事件一致性、测试可行性
- 发现与处理：
  - [major] REST 缺少工作流列表端点，刷新后前端无法恢复列表 → 已纳入 server 步骤 3；
  - [major] FakeStepRunner 产物名不符合角色命名，无法支撑演示 → 新建 MockStepRunner 并产出合规 artifact（含补充产物）；
  - [major] @hono/node-server 1.19 对 WS 支持不成熟 → 改用 `ws` 包直挂 HTTP server，事件总线桥接；
  - [minor] WS 事件去重以 workflowId upsert，避免重复推送覆盖本地审批状态 → 已写入 store 设计；
  - [minor] 断线自动重连，重连后以 REST 重新拉取详情兜底 → 已写入关键决策。

## 涉及 UI

本任务为主要 UI 里程碑，已提供线框图；实现时按“可用优先、不追求视觉打磨”原则。

## 实现 review

- 日期：2026-08-15
- 审查方式：类型检查 + 单测 + 前端构建 + 演示模式冒烟
- 结果：typecheck 全绿；server 48 个测试 + data 3 个 + web 4 个通过；vite build 成功；DEMO_MODE 冒烟：四步 completed，六类产物齐全，列表接口正常
- 与 plan 的偏差与发现：
  - [major] store 的 step 事件需“新增或替换”而非仅替换，避免事件先于详情到达时丢步骤 → 已改为 upsertStep；
  - [minor] WS 测试中 hello 帧可能在消息监听器挂载前到达 → 先挂监听再等 open；
  - [minor] 前端测试的 fetch mock 需兼容不带 method 的 GET → 已修正；
  - [minor] WebSocket 集成测试与 MockStepRunner 测试需真实 workflow/step 行 → 已按真实结构构造。
