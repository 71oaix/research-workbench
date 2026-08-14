---
title: 系统架构（M1）
status: active
created: 2026-08-14
updated: 2026-08-14
---

# 系统架构（M1）

## 总览

```text
┌─────────────────────────────────────────────────┐
│ apps/web（Vite + React）                         │
│ 三栏占位工作台 + 健康检查                         │
└───────────────┬─────────────────────────────────┘
                │ HTTP /api/*（Vite 代理到 3000）
                │ WebSocket /ws
┌───────────────▼─────────────────────────────────┐
│ apps/server（Hono + @hono/node-server）          │
│ /health · /ws 占位 · AgentRuntimeProvider 抽象   │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│ packages/data（better-sqlite3）                  │
│ workflows / steps / artifacts / papers /         │
│ decisions / usage_records                        │
└─────────────────────────────────────────────────┘
```

## 组件职责

| 包 | 职责 | M1 状态 |
|----|------|---------|
| packages/shared | 核心类型 + WS 协议 | ✅ |
| packages/data | SQLite schema + 仓储接口/实现 | ✅ |
| WorkflowEngine（apps/server/src/engine） | 状态机 + artifact 交接 + 审批点 + 事件广播 | ✅（M2-1） |
| apps/server | Hono 入口、/health、工作流 REST、WS 占位、运行时抽象 | ✅（provider 为 noop 占位） |
| apps/web | 三栏占位页 + 健康检查 | ✅ |
| scripts/dev.js | 一键并行启动 | ✅ |
| .github/workflows/ci.yml | install → typecheck → build → test | ✅ |

## 关键接口

- `GET /health` → `{ status: 'ok', db: 'ok' }`
- `POST /workflows` → 创建工作流（goal + steps，steps 含 role / requiresApproval）
- `POST /workflows/:id/start` → 开始执行
- `GET /workflows/:id` → 工作流 + 步骤 + artifact + 决策
- `POST /workflows/:id/steps/:stepId/decision` → approve / reject
- `GET /ws` → 426 占位（协议类型已在 shared 定义，真实 WS 通道 M2 接入）
- `AgentRuntimeProvider.createRuntime(role, systemPrompt)` → M2 接入 pi SDK

## 工作流状态机（M2-1）

```text
create → planning
start  → executing
  顺序执行步骤（pending → running → runner 产出 artifact）：
    ├ requiresApproval=false → approved → 下一步
    └ requiresApproval=true  → awaiting_approval（workflow: paused）
approve → step approved → 有下一步则执行，否则 workflow: completed
reject  → step rejected → workflow: cancelled（记录 decision）
```

执行器通过 `StepRunner` 接口注入（M2-1 为 FakeStepRunner，M2-2 替换为真实模型 runner）；
事件通过 `WorkflowEventBus` 广播（`workflow.created/updated`、`step.updated`、`artifact.updated`、`decision.created`），WS 后续接入同一总线。

## 端口与代理

- web: http://localhost:5173（`/api/*` 代理到 3000）
- server: http://localhost:3000
- 两者均支持环境变量覆盖（`PORT`、Vite 配置）
