# 检索效果对比报告（全量版 vs 无迭代基线）

- 时间：2026-08-20T11:41:48.585Z
- 基线口径：仅关键词组（无子问题合并 / 时间过滤 / 引文雪球 / 相关度分级排序）；同义词扩展为生产行为保留

| id | 查询 | 全量 recall@20 | 基线 recall@20 | Δ | 全量命中 | 基线命中 | 全量查询数 | 基线查询数 |
|----|------|---------------|----------------|----|----------|----------|------------|------------|
| q01 | 什么是智能体？智能体理论与综述 / intelligent agents survey theory architecture | 33% | 33% | 0.0pp | 75 | 75 | 8 | 8 |
| q02 | 多智能体记忆架构 / multi-agent memory architecture | 0% | 0% | 0.0pp | 75 | 75 | 8 | 8 |
| q03 | 检索增强生成 RAG 的综述与方法，2020 年至今 / retrieval augmented generation survey | 33% | 33% | 0.0pp | 97 | 97 | 8 | 8 |
| q04 | 大语言模型幻觉的检测与缓解 / large language model hallucination detection mitigation | 0% | 0% | 0.0pp | 72 | 72 | 8 | 8 |
| q05 | 图神经网络在推荐系统中的应用 / graph neural network recommender system | 0% | 0% | 0.0pp | 92 | 76 | 8 | 8 |
| q06 | 基于强化学习的代码生成 / reinforcement learning code generation | 33% | 67% | -33.3pp | 74 | 93 | 8 | 8 |
| q07 | 神经符号推理的最新进展 2020 年以后 / neuro-symbolic reasoning | 0% | 0% | 0.0pp | 98 | 98 | 8 | 8 |
| q08 | 联邦学习的隐私与安全 2020 至今 / federated learning privacy security | 0% | 0% | 0.0pp | 100 | 98 | 8 | 8 |
| q09 | 长上下文语言模型的效率优化 / long context language model efficiency | 0% | 0% | 0.0pp | 98 | 98 | 8 | 8 |
| q10 | 学术文献智能检索与评测基准 / academic literature retrieval benchmark | 50% | 25% | 25.0pp | 100 | 74 | 8 | 8 |

- 平均 recall@20：全量 15.0% vs 基线 15.8%（10 条有金标）

> 本对比不覆盖 selector 分级排序与引文雪球（需完整工作流核验率口径，见 --workflow）。