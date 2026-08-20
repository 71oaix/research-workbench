---
title: Crossref 结果污染：Table/Figure/Supplementary 图表标题挤占候选池
status: active
created: 2026-08-21
updated: 2026-08-21
kind: bug
priority: high
triage: actionable
areas: [server]
resolution_plan: "docs/plans/open/2026-08-21-search-source-reliability.md"
---

# Crossref 结果污染：Table/Figure/Supplementary 图表标题挤占候选池

## 背景

LitSearch 首条查询（hard negatives / dense retriever training）的 top-20 里，
几乎全是 Crossref 收录的图表条目：

```
Table 4: Evaluation metrics. TP, true positives...
Figure 11: False negatives in detection.
Supplementary file 3. Curator-SciScore-disagreement...
```

根因：Crossref 把论文中的图注/表注/补充材料作为独立 work 收录，关键词命中后
以"论文"身份进入候选池。它们既不是有效论文，又会挤占 top-20 的有限位置，
直接压低 recall@20（离线评测 6.7% 的组成部分之一），并增加 selector 的噪声。

## 目标

1. 在 Crossref 归一化阶段过滤图表/补充材料类条目，使候选池只保留真实论文；
2. 不误杀正常论文标题（如 "Table-based…"、"Figure Ground…"、"Supplementary
   Materials in …" 这类合法标题）；
3. 过滤规则可测试、可回归。

## 范围（做）

- `apps/server/src/search/crossref.ts`：归一化时增加标题/类型过滤规则；
- 单元测试：阳性样例（Table/Figure/Supplementary 前缀 + 数字冒号等特征）与
  回归样例（含 Table/Figure 词的正常论文标题不被过滤）；
- 复测 LitSearch 30 条：量化过滤后 recall@20 与候选池纯净度变化。

## 不做

- 其他源（OpenAlex / arXiv / S2）的同类污染（如发现，另开 issue）；
- 全库级数据清洗（数据在 Crossref 侧，我们只做消费端过滤）；
- 排序算法改造（相关度排序属于 M3 方向）。

## 验收标准

- [ ] lit-1 类查询 top-20 不再出现 Table/Figure/Supplementary 图表标题条目；
- [ ] 正常论文标题不被误杀（回归测试覆盖含 "Table"/"Figure" 词的标题）；
- [ ] 复测 LitSearch 30 条：过滤前后 recall@20 变化有量化记录；
- [ ] typecheck / test 全绿。

## 关联

- 证据：`data/eval/report-litsearch-30.md`（lit-1 top-20 污染明细）；
- 依赖：无；建议与"检索源可靠性"（同日 issue）一起修复后统一复测。
