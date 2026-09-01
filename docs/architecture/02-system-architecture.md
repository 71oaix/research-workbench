---
title: 系统架构（M1）
status: active
created: 2026-08-14
updated: 2026-08-17
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
| PiRuntimeProvider（apps/server/src/runtime） | pi SDK 0.80.3 + deepseek-v4-flash（官方或百炼兼容端点，`DEEPSEEK_BASE_URL` 可配），角色提示词注入，usage 落库 | ✅（M2-2） |
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

- Provider：`deepseek`，默认 base URL `https://api.deepseek.com`，Bearer key（`DEEPSEEK_API_KEY`）；
  `DEEPSEEK_BASE_URL` 可指向任意 OpenAI 兼容端点（如阿里云百炼
  `https://dashscope.aliyuncs.com/compatible-mode/v1`，模型名 `deepseek-v4-flash-0731`）
- 默认模型：`deepseek-v4-flash`（已实测）；`PI_DEFAULT_MODEL` / `PI_MODEL_<ROLE>` 可覆盖
- 思考强度：默认全部角色 `xhigh`（映射 DeepSeek `reasoning_effort=max`）；模型注册声明
  `thinkingLevelMap: { high: 'high', xhigh: 'max' }`，`PI_THINKING_LEVEL` / `PI_THINKING_<ROLE>` 可覆盖
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

## 引用核验（M2-9）

- 引用解析：`citations/lint.ts` 新增 `extractCitationRefs`，兼容 `[n]` 与 `[V1-n]`（归一化为 n）并保留格式异常标记
- DOI 交叉：`CrossrefClient.lookup(doi)` 命中 `/works/{doi}`；无 DOI 时回退“标题 + 第一作者”检索
- 字段比对：标题核心词（Jaccard）、年份、第一作者逐字段比对，输出 Critical / Warning / Info 与 Verified / Check suggested / Needs fix / Unverifiable
- 接入 Reviewer：`EvidenceStepServiceImpl.prepareReviewer` 生成 `citation-verification.md` artifact 并注入 reviewer prompt，与 `citation-lint.md` 并列

## 审查与评估（M2-10）

- Concern Ledger：reviewer 按固定格式（`### C{n}` + severity / blocking / claim / evidence / resolution）输出，`@research-workbench/shared` 的 `parseConcernLedger` 解析并计数，UI 展示 Blocking / Major / Minor
- 评估报告：`evidence/evaluation.ts` 确定性词元匹配（英文词 + 中文 bigram），在 `prepareReviewer` 生成 `evaluation-report.md` 并注入 reviewer；四指标：主题匹配门禁（默认 0.4，`EVALUATION_TOPIC_GATE` 可配置）、平均相关度、大纲覆盖、来源失败
- 一键打回 Writer：`ApprovalPanel` 在 reviewer 步骤解析 blocking concerns，点击“打回 Writer”自动预填意见并发 `modify`（复用 reviewer→writer 语义）

## 真实案例修复（M2-11）

- 全文提取：`fullText.ts` 导入 `pdf-parse/lib/pdf-parse.js`（绕过入口调试分支，修复 ESM 下全文提取全失败）
- 流程恢复：`WorkflowEngine.recoverInterrupted()` 启动时把 running 步骤清为 failed；`PiRuntimeHandle.send` 5 分钟超时（`PI_STEP_TIMEOUT_MS` 可配置）
- 引用核验：arXiv DOI（`10.48550/arxiv.*`）走 arXiv lookup，不再误报 Critical；报告计数缺省补 0
- 评估口径：相关度改为主题词覆盖率、大纲覆盖只比章级、来源失败从原始 `research-cards.md` 解析
- 产物呈现：`ArtifactTabs` 按“规划 / 检索证据 / 全文 / 引用核验 / 评估 / 草稿 / 审查”分组，每个产物带用途说明，多版本支持结构 diff，全文默认折叠
- 检索过滤：researcher 用 plan 主题词剔除零交集论文
- 状态解耦：前端 decide 使用步骤自带 workflowId，列表区分同名工作流

## 可靠性与性能加固（M2-12）

- 全文下载：`resolvePdfUrls` 返回去重候选数组（arXiv → 期刊 OA），依次尝试、任一成功即成功；
  提取文本 ≥ 500 字符才算有效；每篇独立并发 ≤ 3；`papers` 表新增 `download_status` / `download_error`，
  卡片与 `paper-fulltext.md` 头部展示成功 / 失败 / 无开放获取统计
- 检索并发：`AcademicSearchService` 按数据源分桶并发（`SEARCH_SOURCE_CONCURRENCY` 默认 3），
  仍走各源 RateLimiter；`SEARCH_MAX_GROUPS` 默认 8
- Writer 上下文：只注入前 3 篇全文摘录（首 70% + 末 30%），其余论文仅摘要；
  打回重跑时草稿一律只注入结构摘要（章节 + 引用 + 篇幅）
- 引用核验：DOI/arXiv 结果内存缓存（TTL 24h，负结果 1h），逐条并发 ≤ 3，
  arXiv 核验 6s/次限流 + 429 退避，标题检索 Crossref → Semantic Scholar 兜底
- 审批防重入：`UPDATE steps SET status=? WHERE id=? AND status='awaiting_approval'` 原子抢占，
  `changes=0` 抛 409
- WS 对账：断线重连成功后前端自动 `refreshList()`，避免增量事件丢失造成陈旧状态
- 评估：大纲标题词元 Jaccard ≥ 0.5 或包含核心词即视为覆盖；相关度输出均值 + 中位数

## 效果修复（M2-13）

- 角色：新增 `evaluator`（writer 后、reviewer 前，`requiresApproval=false` 自动执行）；
  评估报告由模型按固定模板生成（逐核心概念命中 / 逐卡相关度 / 大纲覆盖 / gap / 总体结论），
  规则统计（`buildEvaluationInputs`）只作参考输入；reviewer 读取模型评估报告并注入关键全文摘录
- 核验：`ArxivClient.lookupMany` 用 `id_list` 批量（≤10/请求），结果进内存缓存；
  arXiv 失败回退 DOI / 标题搜索，Unverifiable 占比显著下降
- 下载：取消 top-8 截断，有 OA 候选的论文全部尝试（并发 3），
  `SEARCH_DOWNLOAD_MAX`（默认 25）与 `SEARCH_DOWNLOAD_TIMEOUT_MS`（默认 240s）兜底
- 排序：`log2(1+引用数) + SEARCH_RELEVANCE_WEIGHT × 命中主题词数`（默认 2.0，可配 0 恢复纯引用）；
  过滤元数据损坏卡片（无年份 && 无 DOI && 无 arXiv && 无作者，或作者字段异常超长），计入 `skippedPapers`
- 摘录一致性：摘录区声明“已读 N 篇，仅注入前 M 篇，其余仅可引摘要”；reviewer 材料注入前 3 篇全文摘录

## 检索召回与编号修复（M2-14）

- cs 域检索源扩为 arxiv + OpenAlex + Crossref + S2（多源兜底，单源失效不再召回归零）
- 源级熔断：连续失败 ≥3 次停用该源剩余查询，失败源统计为源级一条（失败 N 个查询 + 熔断跳过 M 个）
- arxiv 查询适配：纯中文跳过、>4 实词精简到前 3 实词、空结果二次放宽（前 2 词 → 首词）
- 全文编号：`paper-fulltext.md` 段落编号 = 卡片编号（index+1），下载失败不占编号
- 不可核验卡片：无年份 + 无摘要 + 无 DOI/arXiv 管道端过滤；有年份无摘要标注“摘要：缺失”

## 澄清、筛选与华为赛题性能吸收（M2-15）

- 流程六步：规划 → 检索（候选池）→ **筛选（selector，自动）** → 写作 → 评估 → 审查；
  selector 位于 researcher 与 writer 之间，`requiresApproval=false`
- 规划澄清：planner 检测到模糊问题（缺领域 / 对象类型 / 场景 / 时间范围）时输出“## 澄清请求”小节，
  审批面板显示提示条，用户以审批意见回答，planner 重跑吸收后收敛锚点
- 候选池拆分：researcher 只产出 `research-candidates.md`（人/模型可读）与
  `research-candidates.json`（结构化，供 selector 代码解析），不再立即下载全文
- selector 角色：逐篇分析标题 + 摘要（内容 / 场景 / 创新点），输出 入选/剔除 + 相关度分级
  （高 / 部分）+ 理由（≤120 字）+ “二次检索建议”（2-4 条）；解析失败回退“全量入选”安全网
- 引文雪球：对入选且来自 OpenAlex 的 top-3 论文，用 `filter=cites:W{id}`（被引方向）与
  `select=referenced_works` → `filter=openalex:W1|W2`（参考文献方向）补充候选
- gap 二次检索：按 selector 建议查询补检（`onlyGapQueries` 不复跑基础查询），
  与雪球结果合并去重后，仅对新候选重筛 1 次
- 时间过滤：plan 中的时间范围（年份区间 / 近 N 年）→ OpenAlex `from/to_publication_date`、
  S2 `year`；解析失败不加过滤（安全网）
- RefChain 检索：查询组 = 检索关键词 ∪ 子问题（去重，上限 `SEARCH_MAX_GROUPS` 默认 10）；
  同义词扩展：LLM→large language model、RAG→retrieval augmented generation 等确定性映射，每组至多 +2
- 相关度分级排序：`mergeAndRank` 中分级优先、引用数退为 tie-breaker；
  卡片展示“相关度”与“筛选理由”，`selector-report.md` 记录入选 / 剔除 / gap / 雪球全量可回溯
- 下载兜底：`SEARCH_UNPAYWALL_EMAIL` 配置后，无候选或候选全失败时查询 Unpaywall 补 PDF 候选
- 评测与成本：`scripts/eval-m2-15.mjs`（离线 recall@20 / precision + 可选完整工作流核验率）、
  `scripts/cost-report.mjs`（usage_records 聚合：调用次数 / token / ¥ / 耗时）；评测数据在 `data/eval/`

## 全量吸收与归纳整理（M2-16）

- summarizer 角色：reviewer 之后的收尾步骤（`requiresApproval=false`，确定性实现、不调用模型），
  产出 `05-summary.md`（主题分组 + 相关度分级 + 引用清单）与 `references.bib`
- 主题分组：概念优先取 plan“检索关键词”（双语），其次锚定点 / 子问题；卡片按标题 + 摘要词元交叠分组，
  主组 + 相关组，未命中进“其他”
- BibTeX：只输出必填字段（title/author/year/doi/arxiv/url），缺失不编造
- writer 可选项：新建工作流勾选“包含综述写作”；不勾选时流程为
  规划 → 检索 → 筛选 → 评估 → 审查 → 归纳（六步调研模板）
- 无 writer 降级：evaluator“大纲覆盖”改为“证据池覆盖”；reviewer 无草稿时跳过
  lint/引用核验，输出“证据调研审查”（覆盖度 + 分级合理性 + 缺口）
- 评测闭环：`eval-m2-15.mjs` 支持 `--baseline`（无迭代基线：仅关键词组）与
  `--litsearch`（HF 数据集子集）；`fetch-litsearch.mjs` 拉取 LitSearch 查询
- 成本落地：`cost-report.mjs` 聚合 usage_records 写入 `docs/research/` 指标表
