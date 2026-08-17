---
title: M2-14 检索召回与产物编号修复（plan）
status: active
created: 2026-08-17
updated: 2026-08-17
issue: 2026-08-17-m2-14-search-recall-and-artifact-ids
areas: [server]
---

# M2-14 检索召回与产物编号修复（plan）

## 任务解释

修复 M2-13 真实运行对比暴露的两个问题：检索召回从 77 篇退化到 5 篇（cs 域只有 arxiv + S2 两个源、
S2 无 key 成批 429、arxiv 长短语召回弱），以及 `paper-fulltext.md` 编号与卡片编号错位
（中间卡片下载失败后全文段落编号错位，导致 writer/reviewer 引用错位）。

## 第一性原理

| 问题 | 第一性追问 | 基线 |
|------|-----------|------|
| cs 域只有 2 个源 | “召回”不能押在单一可用源上；源越多，单源失败影响越小 | cs 域并入 OpenAlex / Crossref |
| S2 无 key 成批 429 | 失效源应被熔断并降级，而不是把失败噪音刷满报告 | 连续失败 ≥3 次停用该源剩余查询，失败源统计压缩为源级 |
| arxiv 长短语召回弱 | arxiv 全文索引对 5 词 AND 查询过严；应把查询精简到核心实词 | >4 词查询精简到前 3 实词；纯中文查询跳过；空结果放宽到首词 |
| 全文编号与卡片错位 | 编号语义应是“卡片编号”，不是“全文列表序号” | `buildFullTextMd` 按卡片 index+1 编号，中间失败不占编号 |
| 不可核验卡片进池 | 无年份/无摘要/无 DOI/arXiv 的卡片无法支撑综述，应在管道端过滤 | 过滤条件扩展 + `skippedPapers` 统计 |

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| cs 域源集合 | arxiv + OpenAlex + Crossref + S2（有 key 时 T1，无 key 时 T2） | 维持现状（arxiv + S2） | 多源兜底，单源失败不再导致召回归零 |
| S2 无 key | 保留为 T2 但启用熔断：连续失败 ≥3 次后停用该源剩余查询 | 直接不注册 S2 / 全量重试 | 匿名池可用时保留收益（上次 77 篇依赖它），不可用时快速降级 |
| 失败源统计 | 熔断后失败源只记一条“源级熔断（N 个查询跳过）”，不再逐查询列 19 条 | 现状逐条 | 减少评估/卡片噪音，问题归因到源而不是查询 |
| arxiv 查询构造 | 纯中文查询跳过；>4 词查询去停用词后取前 3 实词；空结果二次放宽到首词 | 整句 AND（现状） | 长短语 AND 召回过低；相关性由 M2-13 的相关度加权兜底 |
| 全文编号 | `buildFullTextMd` 按卡片数组 index+1 编号；中间下载失败不占编号 | 全文列表序号（现状） | 编号语义与卡片一致，writer/reviewer 引用不错位 |
| 不可核验卡片 | 过滤“无年份 && 无摘要 && 无 DOI && 无 arXiv”（即使有作者/url）；有年份但无摘要保留并标注“摘要缺失” | 现状条件（还需无作者） | 无年份无摘要的卡片既不能核验也不能支撑综述 |

## 实现步骤

1. **sources.ts（P0-1）**
   - `openalex` 与 `crossref` 的 `domains` 加入 `'cs'`；
   - `buildSourceRegistry`：S2 无 key 时仍注册但 tier=T2；`AcademicSearchService` 对 T2 源启用熔断。
2. **AcademicSearchService.ts（P0-1）**
   - 每源维护失败计数：`searchOne` 抛错/空结果连续 ≥3 次 → 标记该源熔断，剩余该源查询直接跳过（计入 `failedSources` 为一条源级记录）；
   - 失败源统计改为“源级”汇总：`failedSources` 每条为 `源(原因: 熔断/超时/429)`，不再逐查询展开。
3. **keywords.ts / arxiv 查询（P0-2）**
   - `expandKeywordQueries` 或 arxiv client：纯中文查询跳过；>4 词英文查询去停用词取前 3 实词；
   - arxiv `search` 空结果二次放宽：现有 `broadenQuery`（前 2 词）后追加“首词”放宽（在 `AcademicSearchService.searchOne` 中）。
4. **researcherStep.ts（P1-1）**
   - `buildFullTextMd` 改为按卡片数组 index+1 编号，仅对有全文的卡片输出段落；
   - `buildFullTextExcerpts` 无需改动（解析 `## [N]` 自动对齐）。
5. **merge.ts（P1-2）**
   - `filterBrokenPapers` 条件扩展：`无年份 && 无摘要 && 无 DOI && 无 arXiv` 剔除；
   - 卡片 `buildResearchCards` 对“有年份但无摘要”的卡片标注“摘要缺失”。
6. **测试 / 文档 / 验证脚本**：见下。

## 测试方案

- sources：cs 域源集合断言（含 openalex/crossref）；S2 无 key 时 tier=T2；
- 熔断：fake client 连续失败 3 次 → 后续查询不再调用该 client；`failedSources` 只有源级一条；
- arxiv 查询：>4 词查询精简断言（≤3 实词）；纯中文查询不调用 arxiv；
- fulltext 编号：3 篇中中间 1 篇下载失败 → 段落编号为 [1]、[3]；
- merge：无年份+无摘要+无 DOI/arXiv 卡片被过滤（skippedPapers 计数）；有年份无摘要保留并标注；
- 手动：`node scripts/verify-m2-14.mjs`（真实运行命中/去重 ≥ 40、失败源 ≤ 5 条、全文编号与卡片一致）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/guide/runbook.md`：S2 熔断行为、arxiv 查询精简说明；
- `docs/architecture/02-system-architecture.md`：M2-14 检索多源与编号修复；
- `docs/INDEX.md`：登记 M2-14 plan。

## 涉及 UI

无页面改动：卡片产物增加“摘要缺失”标注与失败源源级汇总，属产物文本变化，无需线框图。

## 对抗性审查（plan review，2026-08-17）

- [major] cs 域加 OpenAlex/Crossref 使单次查询数从 32 增至 64+，检索耗时可能上升 → 每源并发池（≤3）与
  查询组默认 8 已兜底；若超出时间预算，可下调 `SEARCH_MAX_GROUPS`，不阻塞。
- [major] S2 熔断可能误伤匿名池可用时段（M2-12 的 77 篇依赖 S2）→ 熔断阈值设为连续 ≥3 次失败，
  且只停用该源剩余查询、不影响其他源；卡片仍记录“S2 已熔断”。
- [major] arxiv 查询精简（前 3 实词）可能引入噪声 → 仅对 >4 词查询生效；相关性由 M2-13 的相关度加权
  （命中主题词数）在排序层兜底；`SEARCH_RELEVANCE_WEIGHT` 可调。
- [minor] 全文编号依赖“卡片编号 = 过滤后数组 index+1” → `buildFullTextMd` 直接接收带全文的 ranked
  数组并按 index 编号，单测覆盖中间失败场景。
- [minor] 过滤“无年份无摘要无标识”可能误删新预印本 → 保留 `skippedPapers` 统计与卡片可见性，
  核验报告仍可追溯；误删可经统计回查。

## 预览

本地 `npm run dev`：http://localhost:5173（产物在 workflow 详情可见）。
