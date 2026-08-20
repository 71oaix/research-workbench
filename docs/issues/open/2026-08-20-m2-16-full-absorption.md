---
title: M2-16 全量吸收：结果归纳整理 + 评测闭环 + 成本落地 + writer 可选项
status: active
created: 2026-08-20
updated: 2026-08-20
kind: feature
priority: high
triage: needs-plan
areas: [server, web, scripts, docs]
depends_on:
  - "docs/issues/open/2026-08-18-m2-15-clarify-and-select-papers.md"
---

# M2-16 全量吸收：结果归纳整理 + 评测闭环 + 成本落地 + writer 可选项

## 背景

M2-15 已完成华为赛题第一波吸收（RefChain 子问题检索、同义词扩展、时间范围过滤、
selector 相关度分级、gap 二次检索、引文雪球、Unpaywall），真实运行验证通过：

- 宽泛问题“研究下什么是 agent”第一轮触发澄清请求，回答后第二轮锚点收敛；
- 命中 / 去重 3041，候选池 38 篇，入选 21 篇（高相关 11 / 部分相关 10）；
- 每张入选卡片带筛选理由与相关度分级；top-15 无“太极统一场论”类明显无关论文；
- 全文编号与卡片编号一致；selector-report.md 可回溯。

对照华为赛题评分（F1 70% / 运行效率 20% / 结果结构化 10%）与
`docs/research/2026-08-20-huawei-topic-absorption.md` 的能力映射，剩余差距：

1. **结果归纳整理（10% 结构化分）**：当前最终产物只有卡片 + 草稿，没有
   “按主题分组 + 分级标签 + 引用清单导出”的结构化输出；
2. **评测闭环（20% 效率分 + “效果怎么证明”）**：eval/cost 脚本已就绪，但未跑通
   全量评测（LitSearch 子集 + 自建）、没有“无迭代版”基线与分级消融对比，
   指标未写入项目文档；
3. **成本报告落地**：usage_records 聚合脚本已就绪，未生成指标表进文档；
4. **writer 可选项（用户需求）**：用户明确后续把 writer 变为可选项，先做好
   筛选与排序；需支持“无 writer 的调研流程”并在该模式下仍能产出结构化调研结果。

## 目标

1. 产出结构化调研结果：主题分组列表（按 plan 锚点概念聚类）+ 相关度分级标签 +
   引用清单导出（Markdown / BibTeX），作为最终产物进 UI；
2. 评测闭环：LitSearch 子集（20-30 条）+ 自建（10-20 条）全量跑通，
   输出 recall@20 / precision / 核验率 / 每查询成本与延时指标表；
   含“无迭代版”基线与当前全量版对比（可量化华为吸收带来的收益）；
3. 成本报告：cost-report 聚合后写入 `docs/research/` 指标表；
4. writer 可选项：新建工作流时可选“包含综述写作”，不选时流程为
   规划 → 检索 → 筛选 → 评估 → 审查，仍产出可交付的调研结果。

## 范围（做）

- 新增 `summarizer` 归纳整理（确定性主题分组 + 分级标签 + 引用清单导出）；
- eval-m2-15 扩展基线对比（无迭代版 vs 全量版）；LitSearch 子集数据落地；
- cost-report 输出指标表并写入文档；
- 前端模板选择：writer 可选（六步 / 五步调研模板）；
- 无 writer 模式下 evaluator/reviewer 的降级口径（证据池覆盖、无草稿审查规则）。

## 不做

- 关系图（用主题分组列表替代，留赛后）；
- 全文 QA / PaperQA2 方向、模型精排（留 M3）；
- Docker / PostgreSQL（MVP 数据层仍是 SQLite 抽象）；
- 引文网络可视化（同上）。

## 验收标准

- [ ] 完整流程产物含“主题分组 + 分级标签 + 引用清单导出”（Markdown 与 BibTeX）
- [ ] 五步调研模板（无 writer）可完整跑通并产出结构化调研结果
- [ ] eval-m2-15 全量输出 recall@20 / precision / 核验率 / 每查询成本延时指标表，
  含无迭代版基线与全量版对比
- [ ] 成本指标表写入 `docs/research/`，可从 cost-report 复现
- [ ] typecheck / test 全绿

## 关联

- 依赖：M2-15（已实现验证）
- 后续：M3（模型精排、全文 QA、可观测面板、关系图）
