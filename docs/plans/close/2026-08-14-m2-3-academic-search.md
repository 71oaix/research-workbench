---
title: M2-3 学术检索工具（Semantic Scholar / OpenAlex 真实论文卡片）（plan）
status: archived
created: 2026-08-14
updated: 2026-08-14
issue: 2026-08-14-m2-3-academic-search
areas: [server, data, shared]
---

# M2-3 学术检索工具（Semantic Scholar / OpenAlex 真实论文卡片）（plan）

## 任务解释

给 Researcher 步骤接入真实学术检索：从 Planner 的 `01-plan.md` 提取检索关键词，用代码并行查询 Semantic Scholar 与 OpenAlex，去重合并后生成论文卡片，落库 `papers`，最后让模型把卡片精简成 `02-research.md`，为 M2-4 Writer 提供可引用的证据来源。

方案依据为 [学术检索最佳实践调研](../research/2026-08-14-academic-search-best-practices.md)，核心结论：检索核心用确定性管道是行业主流，agent 只做扩展与精排。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 检索管线 | 方案 A：确定性管道。代码负责关键词解析、API 调用、去重排序；模型只做卡片整理 | 方案 B：模型自主调工具 | 调研共识；可复现、可审计、成本低；agentic 增强（引用雪球、完整性批评、模型精排）留 M3 |
| 数据源 | Semantic Scholar + OpenAlex 双源并行 | 单源；或再加 arXiv / PubMed | 覆盖互补：S2 偏引用图与 CS/AI，OpenAlex 偏全领域与开放获取；client 抽象后新增源成本低 |
| 查询策略 | 每组关键词分别查两个源，每查询 25 条（可配） | 单次大 limit | 覆盖关键词多样性，限流友好，命中量可控 |
| 字段归一化 | 统一映射为 shared `Paper`（含新增 `arxivId`） | 各源原始结构直传 | 去重、入库、卡片生成只依赖一种结构 |
| 去重键 | 任一命中即合并：归一化 DOI / arXiv ID（去版本号）/ 归一化标题 | 只按标题 / 只按 DOI | 调研共识；同一论文的多 DOI 版本（期刊、预印本）也能合并，DOI 作为展示主键 |
| 合并规则 | 保留最富字段（最长摘要、最大引用数、作者并集），累计来源集合 | 简单丢弃重复 | 信息不丢失；来源集合用于排序 tie-break |
| 排序 | 引用数降序 → 来源数降序 → 年份降序，取前 15（可配） | 五层加权 / 模型精排 | MVP 可解释；相关性由查询本身保证，不二次硬过滤；进阶留 M3 |
| 落库 | 每个源各自按 `(source, external_id)` upsert；跨源合并结果存内存 + artifact | 落库合并表 | 不改表语义，保留 provenance；重复检索不产生重复行 |
| 限流容错 | S2：进程内 1 rps 限流，429 睡 5 s 重试并尊重 `Retry-After`，最多 3 次；OpenAlex：`mailto` polite pool + `select` 字段 + per-page | 无限制 / 复杂退避 | 各来源对 QPS 说法不一，按最保守值实现；免费额度足够 |
| 故障语义 | `Promise.allSettled`：单源失败降级到另一源并记录失败源；双源失败抛错 → workflow `failed` | 全部失败仍返回空 | 复用 M2-2 的 `failed` 状态；失败可观测 |
| 模型参与 | 检索阶段零模型调用；researcher 仅用模型把卡片精简为 `02-research.md` | 模型生成或改写查询 | 确定性 + 低成本；查询分解已由 Planner 完成 |
| 配置 | `SEMANTIC_SCHOLAR_API_KEY`（可选）、`OPENALEX_MAILTO`（可选）、`SEARCH_TOP_N`、`SEARCH_PER_QUERY` | 硬编码 | 无 key 可跑，有 key 更快；key 只进环境变量 |
| 中间产物 | 确定性卡片 `research-cards.md` + 检索统计与失败源写入 artifact 与事件 | 落原始 API 响应 | 可观测但不膨胀；原始响应不持久化 |

## 实现步骤

1. **shared 类型**：`Paper` 增加可选 `arxivId: string | null`；`ws-protocol` 增加 `search.completed` 事件（`workflowId / stepId / stats`，stats 含查询组数、源数、命中数、去重后篇数、失败源列表）。
2. **data 迁移**：`papers` 表新增 `arxiv_id TEXT` 列（沿用 `migrate()` 的 PRAGMA 检查方式）；`repositories.ts` 的 upsert / map 支持 `arxivId`。
3. **检索抽象**：`apps/server/src/search/types.ts` 定义 `AcademicSearchClient`（`search(query, limit) → Paper[]`）、`SearchStats`；shared `Paper` 作为统一输出。
4. **限流器**：`apps/server/src/search/rateLimiter.ts` 进程内 token bucket，默认 1 rps，可注入，保证并发查询不爆 429。
5. **S2 client**：`semanticScholar.ts`，`GET /graph/v1/paper/search`，字段 `title,abstract,year,authors,venue,externalIds,citationCount,openAccessPdf,url`；有 key 时加 `x-api-key`；429 睡 5 s 重试（尊重 `Retry-After`）、5xx 指数退避、30 s 超时；`externalId` 用 S2 paperId，`arxivId` 取 `externalIds.ArXiv`。
6. **OpenAlex client**：`openAlex.ts`，`GET /works`，`search + per-page + select + mailto`；摘要用 `abstract_inverted_index` 重建；`externalId` 用 OpenAlex work ID（`W...`）；`arxivId` 从可用 ID 字段提取，无则空；同样实现超时与重试。
7. **关键词提取**：`keywords.ts` 从 `01-plan.md` 解析“检索关键词”小节（列表项、去序号与加粗），最多 3 组；解析不到时退回“子问题”条目作为查询；仍为空则抛错置 `failed` 并给出格式提示。
8. **合并排序**：`merge.ts`，去重键按 DOI → arXiv ID → 归一化标题；合并保留最长摘要、最大引用数、作者并集、URL 优先 doi.org；来源集合存内存；排序与 top N。
9. **检索服务**：`AcademicSearchService.ts`，对每组关键词并行查双源（`Promise.allSettled`），收集命中与失败源，调用 merge，产出 `SearchStats`；不落原始响应。
10. **researcher 分支**：`PiStepRunner` 增加 researcher 专用前置步骤：解析关键词 → 检索 → `papers.upsert` 逐篇落库（S2 / OpenAlex 各一行）→ 生成 `research-cards.md` artifact（检索概览 + 论文卡片，含失败源说明）→ 将卡片注入 prompt → 模型精简输出 `02-research.md`；其余角色行为不变。
11. **事件与入口**：`eventBus` 支持并广播 `search.completed`；`index.ts` 组装 `AcademicSearchService` 注入 runner；REST 接口无需改动（artifact 已有读取路径）。
12. **测试与文档**：补单测、扩展真实检索验证脚本、更新架构/数据模型/runbook 文档（见清单）。

## 测试方案

- **单测（vitest，mock HTTP / mock client）**：
  - 关键词提取：标准 planner 格式、缺小节时退回路、超过 3 组截断、空内容报错；
  - S2 client：字段归一化、429 重试成功后返回、429 用尽抛错、5xx 退避、网络异常；
  - OpenAlex client：倒排摘要重建、`mailto` 与 `select` 参数、失败重试；
  - merge：同 DOI 跨源合并为一条（取最大引用数、最长摘要、作者并集）、arXiv 版本号剥离、标题大小写/标点归一化、排序与 top N；
  - 仓储：同 `(source, external_id)` 重复 upsert 不产生重复行；`arxiv_id` 迁移与读写；
  - researcher 分支：mock 检索服务下产出 `research-cards.md`、调用模型 prompt 含卡片、papers 落库、失败源写入统计。
- **手动验证（真实 API）**：
  - 不配任何 key 跑通（S2 慢但可用，OpenAlex 免 key）；
  - 配 key / `mailto` 后验证限流与速度；
  - `02-research.md` 含不少于 10 张卡片（标题 / 年份 / DOI / URL / 引用数）；
  - 重复运行同一工作流不产生重复 papers 行；
  - 临时屏蔽一个源（如断网或错误 base URL）验证单源降级与失败源记录；双源都失败时 workflow 置 `failed`。
- **CI**：typecheck + test 全绿；真实 API 调用不进 CI。
- **验收对照**：逐条覆盖 issue 的 4 项验收标准。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：新增“检索模块（M2-3）”小节（client 抽象、合并排序、事件、配置）。
- `docs/architecture/03-data-model.md`：papers 表补充 `arxiv_id` 字段与“按源落库、跨源合并只在内存”的说明。
- `docs/guide/runbook.md`：新增 `SEMANTIC_SCHOLAR_API_KEY` / `OPENALEX_MAILTO` / `SEARCH_TOP_N` / `SEARCH_PER_QUERY` 与真实检索验证步骤。
- `docs/INDEX.md`：登记本 plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-14
- 审查视角：可复现性、字段语义、故障路径、与现有代码结构匹配
- 发现与处理：
  - [major] 跨源合并结果不落库，可能导致卡片与 papers 表不一致 → 职责写清楚：papers 是证据库（按源留痕），卡片是任务快照 artifact，二者允许不同；验收只看证据库不重复。
  - [major] 关键词解析依赖 Planner 输出格式 → 增加“子问题”兜底；仍失败则明确报错并置 `failed`，不做静默猜测。
  - [minor] S2 与 OpenAlex 的稳定 ID 体系不同 → client 各自映射 `externalId`（S2 paperId / OpenAlex W ID），跨源去重仍走 DOI / arXiv / 标题。
  - [minor] OpenAlex 429 响应不一定带 `Retry-After` → 固定退避 1 s 重试，最多 3 次。
  - [minor] `arxivId` 需要新增列 → 已纳入步骤 2 与数据模型文档，迁移沿用现有 PRAGMA 模式，不破坏已有库。

## 不涉及 UI

本任务纯后端，不涉及 UI，按 artifacts 硬性要求无需线框图或 HTML 预览。
