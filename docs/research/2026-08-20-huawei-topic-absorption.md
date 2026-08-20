---
title: 华为赛题深度吸收方案（查询理解/迭代检索/细粒度排序/评测）
status: active
created: 2026-08-20
updated: 2026-08-20
---

# 华为赛题深度吸收方案

## 目标

把华为赛题（科研场景复杂学术查询的智能论文搜索与推荐）的**思路与资源**转化为研镜的性能提升，
而不是只做表面对齐。核心对标：F1 70% / 运行效率 20% / 结果结构化 10%，以及
查询理解→多策略检索→迭代优化→综合排序→归纳整理的完整链路。

## 能力映射（现状 → 吸收后）

| 华为赛题能力 | 参考系统方法 | 研镜现状 | 吸收方案 |
|--------------|--------------|----------|----------|
| 查询理解/分解 | SPAR RefChain（子问题即子查询）；多维度约束解析 | planner 拆子问题但**子问题未进入检索**；无约束过滤 | ① 子问题并入查询组（RefChain 落地，成本≈0）；② 同义词/缩写扩展（LLM→large language model、RAG→retrieval-augmented generation）；③ plan 时间范围 → OpenAlex `from_publication_date` / S2 `year` 过滤 |
| 自主搜索策略迭代 | SPAR 查询演化；PaSa 迭代检索 | 单轮检索，无反馈回路 | selector 筛选后输出“缺失方向 + 建议查询”→ 代码执行二次检索 → 合并候选池 → 复审（1 次额外模型调用） |
| 引文网络探索 | PaSa Crawler；Ai2 引文追踪 | 无 | 对入选 top-3 论文用 OpenAlex `cited_by` / `referenced_works` 引文雪球补充候选（免费 API，去重合并） |
| 过滤不相干/低质量 | PaSa Selector | M2-15 selector（标题+摘要筛选） | selector 输出“高度相关/部分相关”分级 + 理由；分级进入卡片与排序权重 |
| 细粒度综合排序 | 标题+摘要+全文相关性评估 | 引用数+主题词加权 | 相关度分级优先，引用数退为 tie-breaker；部分相关单列 |
| 结果归纳整理 | 列表/关系图 | 无 | 主题分组列表（按锚点概念聚类）+ 分级标签 + 引用清单导出 |
| 运行效率/成本 | API 调用次数、token、延时 | usage_records 已落库 | 工作流成本报告（调用次数/token/成本/延时），写入文档指标表 |
| 评测基准 | LitSearch / AstaBench / RealScholarQuery | 无 | 评测脚本：LitSearch 子集 20-30 条 + 自建 10-20 条，离线跑 recall@20 / precision / 核验率 / 成本 |

## 评测路线（“效果怎么证明”的答案）

- **LitSearch**（597 查询，ML/NLP，recall@5/20/50）：取 20-30 条查询子集离线评测；
- **AstaBench**（2400+ 题，11 个 benchmark）：选 literature understanding 类小集或仅作背景引用；
- 自建标注：10-20 条真实查询（宽泛+精确混合）手工标注相关论文，跑 recall/precision；
- 每查询成本与延时：从 usage_records 统计（API 调用次数、token、¥、耗时）；
- 输出：README / 项目文档指标表 + 对比基线（BM25、关键词管道即“无迭代版”自比）。

## 优先级（12 天约束）

- **P0（并入 M2-15 一并实现）**：selector 相关度分级、gap 二次检索、引文雪球、
  子问题入查询 + 同义词扩展、时间范围过滤；
- **P1（紧随，可与导出/UI 并行）**：评测脚本（LitSearch 子集 + 自建）、成本报告、主题分组列表；
- **砍**：关系图（用分组列表代替）、全文 QA（PaperQA2 方向）、Docker/PostgreSQL、模型精排（M3）。

## 工作量与时间

- M2-15 升级后约 **2-2.5 轮（8/20-8/23，含精度验收）**；
- 评测 + 成本报告约 **1 轮（8/24-8/25，可与导出/UI 并行）**；
- 总时间线不变：8/25 材料初稿、8/28-8/30 可交付、8/31-9/1 缓冲提交。

## 参考资源（文档引用来源）

- PaSa（ACL 2025）：Crawler+Selector 双 Agent，RealScholarQuery recall@20 超 Google+GPT-4o 37.78%；
- SPAR（arXiv:2507.15245）：RefChain 查询分解 + 查询演化，AutoScholar F1 +56%；
- LitSearch（EMNLP 2024，arXiv:2407.18940）：597 查询检索基准；
- AstaBench（arXiv:2510.21652）：2400+ 题科研 Agent 评测套件；
- Ai2 Paper Finder / PaperQA2：多索引检索 + 引文追踪 / 全文 QA（对照与未来方向）。
