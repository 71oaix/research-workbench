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
- 会话隔离：pi agent 目录默认 `<项目根>/.pi/agent`（可用 `PI_WORKBENCH_AGENT_DIR` 覆盖），与个人 PI 的 `~/.pi/agent` 互不干扰

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

## 证据引用（M2-4）

- Writer 只读 `research-cards.md` 撰写 `03-draft.md`：引言 + 2-4 个章节 + 小结，正文用 [编号] 标注卡片，文末附参考文献列表
- 确定性引用检查：`apps/server/src/citations/lint.ts` 提取草稿中的 [n]，对照卡片实际编号集合生成 `citation-lint.md`；检查不阻断流程，由 Reviewer 与人判断
- Reviewer 基于草稿 + 卡片 + lint 报告输出 `04-review.md`：可信引用清单、存疑引用与原因、覆盖不足的方向、总体结论
- 组件：`EvidenceStepServiceImpl`（writer / reviewer 前置准备 + lint artifact 落库与广播）
- 中间产物：`citation-lint.md`（引用总数、有效编号、越界 / 缺失编号、引用频次）

## 工作流 UI 与 WebSocket（M2-5）

- REST 新增 `GET /workflows` 列表端点
- WebSocket：`ws` 包挂在 @hono/node-server 的 HTTP server 上（path `/ws`），事件总线广播 `ServerEvent` JSON；连接即发 `hello`；客户端断线自动重连
- 前端：React + Zustand store（REST 初始化 + WS 增量更新），三栏布局：工作流列表 / 步骤时间线与产物预览与审批 / 证据引用摘要
- 产物标签页覆盖：01-plan / research-cards / 02-research / citation-lint / 03-draft / 04-review
- 演示模式：`DEMO_MODE=1` 使用 MockStepRunner，产出结构与真实一致的产物，无需模型 key

## 工作流多轮迭代（M2-6）

- 审批语义：`approve` = 通过；`modify` = 打回修改（带意见重跑目标步骤及后续）；`reject` = 显式取消任务
- 打回目标：planner / researcher / writer 打回当前步骤；reviewer 打回 writer，随后 reviewer 自动重审
- 反馈传递：`steps.pending_feedback` 持久化，随 `StepRunInput.feedback` 注入 prompt，执行成功后清空
- 产物版本：重跑生成同名 artifact 新版本（v1 / v2 ...），runner 一律读取最新版本（`findLatestArtifact`）
- 默认模板：四步全部 `requiresApproval=true`，逐步检查

## 规划与检索质量（M2-7）

- Planner 保持默认 `deepseek-v4-flash`（`PI_MODEL_PLANNER` 可覆盖，Pro 后续再测）；计划新增“锚定点”小节，打回时先“锚点修订”
- 源分级：T1=OpenAlex/arXiv/Crossref/有 key 的 S2；T2=无 key 的 S2；按域选源，单源失败降级并记录 tier
- 关键词：全部组（上限 10），组内中英文拆分多查询；命中为空时自动放宽
- 去重：DOI 主键 + arXiv 去版本 + 标题/首作者 Jaccard ≥ 0.90 兜底，合并保留最富字段
- 打回补偿：feedback 非空时提高 per-query、按引用数下限过滤
- 规范片段：`apps/server/src/specs/` 的 `loadSpec` 按需加载检索片段，注入 researcher
- 配置：`SEARCH_MAX_GROUPS` / `SEARCH_COMPENSATE_PER_QUERY` / `SEARCH_MIN_CITATIONS` / `CROSSREF_MAILTO`

## 全文获取与证据闭环（M2-8）

- 全文：top-N（默认 8）论文 OA 优先下载 PDF、校验并提取文本，存入 `papers.full_text`，失败标注“仅摘要”
- 证据池：多版本 `research-cards.md` 合并去重、重编号，Writer / Reviewer / lint 统一基于证据池
- 写作：Writer 注入证据池与 `paper-fulltext.md`，先输出一句话论点与段落图，文末附 claim-evidence map
