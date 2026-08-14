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
| PiRuntimeProvider（apps/server/src/runtime） | pi SDK 0.80.3 + opencode-go/deepseek-v4-flash，角色提示词注入，usage 落库 | ✅（M2-2） |
| apps/server | Hono 入口、/health、工作流 REST、WS 占位 | ✅ |
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

## 模型运行时（M2-2）

- Provider：`opencode-go`，base URL `https://opencode.ai/zen/go/v1`，Bearer key（`OPENCODE_GO_API_KEY`）
- 默认模型：`deepseek-v4-flash`（已实测）；`PI_MODEL_<ROLE>` 可覆盖
- 角色 system prompt 通过 `resourceLoaderOptions.systemPromptOverride` 注入（0.80.3 的正确入口）
- 运行时禁用工具（`noTools: 'all'`），角色只做规划/检索/撰写/审查文本
- 每次调用的 token / 成本写入 `usage_records` 并广播 `usage.recorded`

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

## 检索模块（M2-3）

- 组件：`apps/server/src/search/` 下的 `AcademicSearchClient` 抽象、`SemanticScholarClient`、`OpenAlexClient`、`AcademicSearchService`（关键词解析 + 双源并行 + 合并排序）、`ResearcherStepServiceImpl`（落库 + 生成证据卡片 + 事件广播）
- 流程：`01-plan.md` → 关键词提取（最多 3 组）→ 每组并行查询 Semantic Scholar / OpenAlex（每查询默认 25 条）→ DOI / arXiv / 标题去重合并 → 引用数排序取前 15 → 生成 `research-cards.md` → papers 表按 `(source, external_id)` 落库 → 模型精简为 `02-research.md`
- 去重键优先级：DOI → arXiv ID（去版本号）→ 归一化标题；合并保留最长摘要、最大引用数、作者并集，并累计来源集合
- 限流与容错：Semantic Scholar 进程内 1 req/s + 429 重试；OpenAlex 使用 `mailto` polite pool；单源失败降级到另一源并记录失败源
- 事件：`search.completed`（查询组数、数据源、命中数、去重数、失败源）
- 配置：`SEMANTIC_SCHOLAR_API_KEY`（可选）、`OPENALEX_MAILTO`（可选）、`SEARCH_TOP_N`（默认 15）、`SEARCH_PER_QUERY`（默认 25）
