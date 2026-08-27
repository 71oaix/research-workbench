---
title: M2-14 检索召回与产物编号修复（plan）
status: archived
created: 2026-08-17
updated: 2026-08-17
issue: 2026-08-17-m2-14-search-recall-and-artifact-ids
areas: [server]
---

# M2-14 检索召回与产物编号修复（plan）

## 任务摘要

修复真实运行暴露的两件事：检索召回从 77 篇退化到 5 篇（cs 域只有 arxiv + S2 两个源、S2 无 key 成批 429、
arxiv 长短语召回弱），以及 `paper-fulltext.md` 段落编号与卡片编号错位（中间卡片下载失败后编号漂移，
导致 writer 摘录与 reviewer 引用错位）。让检索多源兜底、失败源熔断降级、编号语义严格对齐卡片。

## 为什么做（原因）

M2-13 真实运行（目标“研究下多智能体的记忆架构”）对比数据：

- 命中/去重从 80/77 降到 **5/5**：cs 域 `detectDomain` 只选 arxiv + semantic-scholar；
  S2 无 key（T2 匿名池）本轮 **15/16 查询被 429 限流**，arxiv 对“episodic semantic memory LLM agent”
  这类 5 词 AND 查询召回极低，两个源同时失效后证据池只剩 5 张，撑不起综述主体（评估/审查均因此打回）。
- 失败源噪音：19 条逐查询失败记录塞满卡片与评估参考数据，问题归因不清。
- 全文编号错位：`buildFullTextMd` 用全文列表序号（index+1）编号；本轮 [2] 下载失败后，[3] 的全文被标成
  “[2]”，writer 摘录区与 reviewer 报告（C4）随之错位——真实产品 bug，已被模型审查抓出。
- 不可核验卡片：[5] 无年份、无摘要、无 DOI/arXiv，仅靠标题+作者进池，核验阶段标题相似度 0.00 标 needs_fix，
   应在管道端过滤。

## 预计效果

- 同一目标真实运行命中/去重从 5 恢复到 **≥40**；
- 失败源噪音从 19 条降到 **≤5 条**（源级熔断汇总）；
- `paper-fulltext.md` / 摘录区编号与卡片编号**完全一致**（含中间下载失败场景单测）；
- 无年份+无摘要+无 DOI/arXiv 的卡片不再进池（`skippedPapers` 可追溯）；
- 检索阶段耗时保持在可接受范围（并发池 + 查询组上限，目标 ≤4 分钟）。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| cs 域源集合 | arxiv + OpenAlex + Crossref + S2（有 key 时 T1、无 key 时 T2） | 维持现状（arxiv + S2） | 多源兜底：单源失效不再召回归零 |
| S2 无 key | 保留为 T2 但启用熔断：连续失败 ≥3 次停用该源剩余查询 | 直接不注册 S2 / 全量重试 | 匿名池可用时保留收益（M2-12 的 77 篇依赖它），不可用时快速降级 |
| 失败源统计 | 熔断后只记“源级熔断（N 个查询跳过）”一条 | 逐查询列 19 条 | 问题归因到源而非查询，评估/卡片噪音大幅下降 |
| arxiv 查询 | 纯中文查询跳过；>4 词英文查询去停用词取前 3 实词；空结果二次放宽到首词 | 整句 AND（现状） | 长短语 AND 召回过低；相关性由 M2-13 相关度加权在排序层兜底 |
| 全文编号 | `buildFullTextMd` 按卡片数组 index+1 编号，下载失败不占编号 | 全文列表序号（现状） | 编号语义与卡片严格一致，杜绝 writer/reviewer 错位 |
| 不可核验卡片 | 过滤“无年份 && 无摘要 && 无 DOI && 无 arXiv”（即使有作者/url）；有年份无摘要保留并标注“摘要缺失” | 现状条件（还需无作者） | 无年份无摘要卡片既不能核验也不能支撑综述 |

## Review 发现与修正

> 已完成独立对抗性审查，发现与处理如下：

- [major] cs 域 4 源使单次查询数从 32 增至 64+，检索耗时可能超预算 → 修正：每源并发池（≤3）+ 查询组默认 8 已兜底；仍超时可下调 `SEARCH_MAX_GROUPS`，不阻塞流程。
- [major] S2 熔断可能误伤匿名池可用时段（M2-12 的 77 篇依赖 S2）→ 修正：熔断阈值设为连续 ≥3 次失败，且只停用该源剩余查询、不影响其他源；卡片保留“S2 已熔断”记录供追溯。
- [major] arxiv 查询精简（前 3 实词）可能引入噪声 → 修正：仅对 >4 词查询生效；相关性由相关度加权（命中主题词数）在排序层兜底，`SEARCH_RELEVANCE_WEIGHT` 可调。
- [minor] 全文编号修复依赖“卡片编号 = 过滤后数组 index+1”假设 → 修正：`buildFullTextMd` 直接接收带全文的 ranked 数组按 index 编号，单测覆盖“中间失败”场景锁死行为。
- [minor] 过滤“无年份无摘要无标识”可能误删新预印本 → 修正：保留 `skippedPapers` 统计与核验报告追溯，误删可回查。
- 未发现其他遗留风险。

## 实现步骤

1. **sources.ts（P0-1）**：`openalex`、`crossref` 的 `domains` 加入 `'cs'`；S2 无 key 仍注册但 tier=T2。
2. **AcademicSearchService.ts（P0-1）**：每源维护失败计数，连续 ≥3 次失败标记熔断并跳过该源剩余查询；
   `failedSources` 改为源级汇总（熔断/超时/429 + 跳过查询数）。
3. **arxiv 查询（P0-2）**：纯中文查询跳过；>4 词英文查询去停用词取前 3 实词；
   `searchOne` 空结果在现有 `broadenQuery`（前 2 词）后追加“首词”放宽。
4. **researcherStep.ts（P1-1）**：`buildFullTextMd` 按卡片数组 index+1 编号，仅对有全文的卡片输出段落。
5. **merge.ts（P1-2）**：`filterBrokenPapers` 条件扩展为“无年份 && 无摘要 && 无 DOI && 无 arXiv”；
   `buildResearchCards` 对“有年份但无摘要”标注“摘要缺失”。
6. **测试 / 文档 / 验证脚本**：见下。

## 测试与验证方案

- 单元测试：
  - sources：cs 域源集合断言（含 openalex/crossref）；S2 无 key 时 tier=T2；
  - 熔断：fake client 连续失败 3 次 → 后续查询不再调用该 client，`failedSources` 只有源级一条；
  - arxiv 查询：>4 词查询精简断言（≤3 实词）；纯中文查询不调用 arxiv；
  - 全文编号：3 篇中中间 1 篇失败 → 段落编号为 [1]、[3]；
  - merge：无年份+无摘要+无标识卡片被过滤（skippedPapers 计数）；有年份无摘要保留并标注。
- 真实运行：`node scripts/verify-m2-14.mjs`（命中/去重 ≥ 40、失败源 ≤ 5、编号与卡片一致）。
- CI：typecheck + test 全绿。

## 验收标准

- [ ] 同一目标真实运行命中/去重 ≥ 40（cs 域多源生效）
- [ ] 失败源 ≤ 5 条（源级熔断生效），S2 无 key 不再成批噪音
- [ ] `paper-fulltext.md` 编号与卡片编号完全一致（含中间下载失败单测）
- [ ] 卡片不再出现无年份/无摘要/无 DOI/arXiv 的不可核验条目
- [ ] typecheck / test 全绿

## 文档更新清单

- `docs/guide/runbook.md`：S2 熔断行为、arxiv 查询精简说明、`SEARCH_SOURCE_CONCURRENCY` 兜底说明；
- `docs/architecture/02-system-architecture.md`：M2-14 检索多源、熔断与编号修复；
- `docs/INDEX.md`：登记 M2-14 plan。

## 涉及 UI / 预览

无页面改动：卡片产物增加“摘要缺失”标注与失败源源级汇总，属产物文本变化，无需线框图。
本地预览：`npm run dev` → http://localhost:5173（产物在 workflow 详情可见）。
