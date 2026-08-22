---
title: M2-14 检索召回与产物编号修复（真实运行对比暴露）
status: archived
created: 2026-08-17
updated: 2026-08-17
kind: bug
priority: high
triage: actionable
areas: [server]
depends_on:
  - "docs/issues/open/2026-08-17-m2-13-effect-audit-fixes.md"
---

# M2-14 检索召回与产物编号修复

## 背景

M2-13 真实运行对比暴露两个问题：

1. **检索召回严重退化**：同一目标（“研究下多智能体的记忆架构”）命中/去重从 M2-12 的 80/77 降到 5/5。
   根因：cs 域只选择 arxiv + semantic-scholar 两个源，而 S2 无 key（T2 匿名共享池）本轮 15/16 查询全被
   限流失败；arxiv 对长短语（如 “episodic semantic memory LLM agent”）召回弱；结果只有 5 张卡片，
   且其中 [5] 无年份/无摘要/无 DOI 无法核验，整体证据池无法支撑综述主体。
2. **paper-fulltext.md 编号与卡片编号错位**：`buildFullTextMd` 用“全文列表序号（index+1）”编号，
   当某卡片下载失败后，后续全文段落编号不再等于卡片编号（本轮 [2] 下载失败，[3] 的全文被标为 [2]），
   writer 摘录区与 reviewer 引用均随之错位；该 bug 被模型评估/审查抓出（C4）。

## 目标

召回恢复到 ≥40 篇/目标、卡片编号与全文/摘录编号严格一致、无元数据不可核验卡片进池。

## 问题清单

### P0-1 检索源选择与降级

- cs 域源选择加入 OpenAlex / Crossref（当前 `detectDomain` 对 cs 只命中 arxiv + S2）；
- S2 无 key 时不再当作主源：标记降级或直接跳过并提示配置 `SEMANTIC_SCHOLAR_API_KEY`；
- 单源批量失败（如 S2 连续 429）时自动把该源的查询并入 T1 源重试。

### P0-2 arxiv 查询构造

- arxiv `all:` 长短语召回弱：按查询词数拆分（≤3 词）或使用 OR 组合，而非整句 AND；
- 空结果时现有的 `broadenQuery`（取前 2 词）加强：二次放宽到单核心词。

### P1-1 全文编号对齐

- `buildFullTextMd` 编号改为论文卡片编号（从 `output.papers` 的索引取），
  下载失败论文的段落不出现且不占编号；
- 摘录区 `### [N]` 与卡片编号一致；新增单测覆盖“中间卡片下载失败”场景。

### P1-2 不可核验卡片

- 无年份 + 无摘要 + 无 DOI/arXiv 的卡片在卡片区标注“无法核验，仅供标题参考”或过滤；
- `filterBrokenPapers` 覆盖条件扩展：标题与权威记录相似度 0（核验阶段）时在报告中标 needs_fix（已有）。

## 范围（做）

- P0-1 / P0-2 / P1-1 / P1-2 四项。

## 不做

- 模型精排、引用雪球、Reader 角色（留 M3）。

## 验收标准

- [ ] 同一目标真实运行命中/去重 ≥ 40（cs 域多源生效）
- [ ] S2 无 key 时不再出现成批失败源噪音
- [ ] paper-fulltext.md 编号与卡片编号完全一致（含中间下载失败场景的单测）
- [ ] 卡片不再出现无年份/无摘要/无 DOI 的不可核验条目
- [ ] typecheck / test 全绿
