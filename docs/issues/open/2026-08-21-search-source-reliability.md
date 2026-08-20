---
title: 检索源可靠性：OpenAlex 计费额度 / S2 无 key 限流导致源半瘫
status: active
created: 2026-08-21
updated: 2026-08-21
kind: bug
priority: high
triage: actionable
areas: [server, docs]
resolution_plan: "docs/plans/open/2026-08-21-search-source-reliability.md"
---

# 检索源可靠性：OpenAlex 计费额度 / S2 无 key 限流导致源半瘫

## 背景

LitSearch 30 条离线评测中，**每条查询**都出现 `openalex(T1) 失败 1 个查询`、
`semantic-scholar(T2) 失败 1 个查询`。直接 curl 复现确认根因不是偶发波动：

- OpenAlex：返回 `429 Rate limit exceeded / Insufficient budget`（计费制，
  免费预算 ≈$0.0001/日，UTC 重置；见 [openalex.org/pricing]）；
- Semantic Scholar：无 key 时返回 `429 Too Many Requests`（官方限流约 1 rps，
  多查询并发必然撞限流）。

结果：离线评测实际只有 Crossref + arXiv 两个源在贡献候选，recall@20 被系统性压低
（30 条平均 6.7%，见 `docs/research/2026-08-21-effect-baseline.md` 第五节）。
此前真实运行中四源可贡献 1398-3041 命中，说明能力存在、但当前运行环境下源级不可用
已成常态，且每次查询还要为 OpenAlex 的 3 次无谓重试多花约 7 秒。

## 目标

1. 识别"预算型 429"（计费余额不足）与普通限流：预算型快速失败，不再做 3 次无谓重试；
2. 源级失效降级补偿：某源不可用时，自动把其检索份额分摊给存活源（提高单源 per-query /
   新增补偿查询），并在 stats 中如实暴露"降级"而非"失败"；
3. 支持并文档化 S2 API key 与 OpenAlex 计费配置（`SEMANTIC_SCHOLAR_API_KEY` 配置项已存在
   但无文档；OpenAlex 无预算/降级配置项）；
4. 无 key / 无预算时的默认降级策略：不允许任何查询稳定损失一个源且不做说明。

## 范围（做）

- `apps/server/src/search/`：429 分类（预算型 vs 限流型）、熔断语义、失效源份额补偿；
- `stats` / 报告口径：降级与失败区分，便于评测可解释；
- 文档：运行手册补充 S2 key / OpenAlex 预算说明与无 key 预期行为；
- 复测 LitSearch 30 条，量化修复前后的 recall / 耗时差异。

## 不做

- 给 OpenAlex 充值 / 采购付费额度（商务决策，不在本次代码范围）；
- 接入新检索源（如 Semantic Scholar Bulk、Google Scholar）；
- 全量 597 条 LitSearch 评测（留到修复验证后）。

## 验收标准

- [ ] 预算型 429 跳过重试：单查询不再出现约 7s 的无谓重试耗时；
- [ ] 某源稳定失效时，存活源补偿份额可观测（stats / 日志有证据）；
- [ ] 无 key 时 S2 默认降级且运行手册写明如何配置 key、配置后的预期；
- [ ] 复测 LitSearch 30 条：`failedSources` 不再每条必现 OpenAlex/S2；
  recall@20 与单查询耗时的变化有量化记录；
- [ ] typecheck / test 全绿。

## 关联

- 证据：`docs/research/2026-08-21-effect-baseline.md` 第五节（6.7% 与源半瘫局限）；
- 依赖：无；建议与"Crossref 图表标题污染"（同日 issue）一起在检索层修复后统一复测。
