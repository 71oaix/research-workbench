---
title: M2-9 引用核验升级（字段级多源交叉 + 分级报告）
status: archived
created: 2026-08-16
updated: 2026-08-16
kind: feature
priority: high
triage: actionable
areas: [server, shared]
depends_on:
  - "docs/issues/close/2026-08-16-m2-8-fulltext-evidence.md"
resolution_plan: "docs/plans/close/2026-08-16-m2-9-citation-verification.md"
---

# M2-9 引用核验升级

## 背景

当前引用检查只判断“编号是否在卡片范围”，真实运行里 writer 使用 `[V1-x]` 前缀导致 lint 报 0，且完全没有回答“这句是否由这篇论文支持”。本任务把引用核验升级为字段级多源交叉验证。

## 目标

- 从草稿解析 DOI / PMID / arXiv / 标题+作者
- 多源交叉（Crossref → PubMed → Semantic Scholar → Web 兜底），逐字段比对
- 输出分级报告与置信度，兼容 `[V1-n]` 格式并提示异常

## 范围（做）

- 引用解析：DOI / PMID / arXiv / 标题+作者
- 字段比对：作者顺序、年份、卷期、页码、标题核心词
- 分级与置信度：Critical / Warning / Info；Verified / Check suggested / Needs fix / Unverifiable；结构化报告
- lint 兼容 `[V1-n]` / `[V2-n]` 归一化，0 引用但含引用符号时标记“格式异常”
- 接入 reviewer 前置阶段

## 不做

- CNKI / 页码深度比对、BibTeX 补丁（留 M3）
- 多审查者隔离（→ M2-10 之后，M3）

## 验收标准

- [ ] 引用解析覆盖 DOI / PMID / arXiv / 标题+作者
- [ ] 分级报告含 Critical/Warning/Info 与四级置信度
- [ ] lint 兼容 `[V1-n]` 并提示格式异常
- [ ] typecheck / test 全绿

## 关联

- 依赖：M2-8
- 后续：M2-10 审查与评估

## M2-12 修订注记（2026-08-17）

本 issue 的“多源交叉”口径在 M2-12 落地：DOI 走 Crossref lookup、arXiv 论文走 arXiv lookup、
无 DOI/arXiv 时标题 + 第一作者检索（Crossref → Semantic Scholar 兜底），
与本文档“Crossref → PubMed → Semantic Scholar → Web 兜底”的原始表述重新对齐
（PubMed/Web 源留 M3，详见 `docs/plans/close/2026-08-16-m2-9-citation-verification.md` 的修订注记）。
