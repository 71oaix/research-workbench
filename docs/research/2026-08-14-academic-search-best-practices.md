---
title: 学术检索最佳实践调研（M2-3）
status: active
created: 2026-08-14
updated: 2026-08-14
tags: [research, m2-3, academic-search, best-practices]
---

# 学术检索最佳实践调研（M2-3）

## 1. 调研目的

M2-3 要给 Researcher 接入真实学术检索（Semantic Scholar + OpenAlex）。动手定方案前，先看看行业里成熟的论文检索系统是怎么设计的，回答四个问题：

- 检索管道应该走确定性代码，还是让模型自己调工具？
- 多源结果怎么去重、合并、排序？
- 两个学术 API 的限流与容错怎么做才算稳妥？
- 这套设计对研镜的“透明可审计”定位意味着什么？

## 2. 来源

| 来源 | 类型 | 对本次调研的贡献 |
|------|------|------------------|
| PaSa（ACL 2025，字节跳动） | 论文 + 开源实现 | agentic 检索的极端样本：Crawler + Selector 双 agent、引用扩展 + RL 训练，召回显著优于 GPT-4o 提示版 |
| scholar-megasearch | 开源 skill | 多源 fan-out、合并去重、五层排序的完整落地，合并排序是确定性脚本 |
| STORM / Co-STORM（Stanford） | 论文 + 开源 | 两阶段（研究 → 写作）、多视角提问、人机协作、模块化 pipeline |
| GPT-Researcher（LangGraph 多 agent 版） | 开源 | planner + 8 agent 团队、评审/修改循环、Human in the loop |
| Open Deep Researcher（LangChain） | 开源 | 主流 agentic deep research 参考；摘要、研究、终稿的模型分工 |
| OpenAlex API 官方文档 | 官方文档 | 积分限流、polite pool、批量 OR 语法、select 字段 |
| PaperOrchestra / Semantic Scholar MCP | 开源实现 | S2 429 重试、进程内限流器、字段选择、API key 收益 |
| OpenAlex agent skill | 开源 skill | 两段式实体查询、per-page 200、批量 DOI 查询 |

完整 URL 见文末“参考来源”。

## 3. 行业共识

### 3.1 检索核心是确定性管道，agent 只做扩展和精排

先说结论：多源检索的“取回、合并、去重、排序”这一步，行业里几乎都用确定性代码，不交给模型自由发挥。

scholar-megasearch 把 fan-out 交给子 agent，但合并去重和排序是 `merge_corpus.py` 这个确定性脚本；它甚至建议优先走 Workflow 而非子 agent。GPT-Researcher 的 planner 生成问题，执行 agent 抓资料，但来源跟踪、汇总过滤仍然在代码层完成。STORM 把整个流程切成知识收集、大纲、文章、润色四个模块，检索器是可插拔接口，问题生成才用模型。Open Deep Researcher 是 agentic 的，但它的 legacy 版本保留了 plan-and-execute 工作流，说明两条路线都成立，确定性路线在可控性上更稳。

唯一的强 agentic 样本是 PaSa：Crawler 自主决定搜索、读论文、扩展引用，Selector 逐篇打分。它靠 RL 在合成数据上训练，在真实查询基准 RealScholarQuery 上 recall 比 GPT-4o 提示版高 30% 以上。代价有两个：不可复现（同一条 query 两次结果可能不同），以及要训练或部署专门模型。对研镜的 MVP 和“透明可控”叙事，确定性管道是正确起点，agentic 能力应作为 M3 的可选扩展（引用雪球、完整性批评），而不是底座。

### 3.2 查询分解是标配

几乎所有系统都先把一个研究问题拆成多个子查询再执行：

- scholar-megasearch：facets，3 到 8 个，覆盖同义词、子方面、宽窄表述、关键作者，并按深度档位控制；
- STORM：多视角提问，先调查相似主题文章，再模拟写作者与专家对话；
- GPT-Researcher：planner 生成一组问题，执行 agent 逐个抓取；
- PaSa：Crawler 从用户 query 生成搜索 query。

研镜的 Planner 已经产出子问题与检索关键词，这一步不需要新造。M2-3 只需把 `01-plan.md` 里的关键词按规则解析出来（最多 3 组），每组建 1 到 2 个查询。

### 3.3 多源检索 + 来源证据

单库会漏：arXiv 没有正式版引用数，Semantic Scholar 可能漏 preprint，Google Scholar 不告诉你哪些库都收录了。行业做法是按“源桶”并行检索（scholar-megasearch 分 A 到 G 七类桶），每条记录保留来源和查询的 provenance。

研镜 M2-3 用 Semantic Scholar + OpenAlex 两个源，覆盖两种互补的索引：S2 偏引用图和 CS/AI 覆盖，OpenAlex 偏全领域与开放获取。MVP 两源够用，后续加 arXiv、PubMed 时只需新增 client。

### 3.4 去重合并：DOI → arXiv ID → 归一化标题

这是最没有争议的一条，scholar-megasearch 的做法可以直接照抄：

- 合并键按优先级：DOI → arXiv ID（去掉版本号）→ 归一化标题（小写、去标点空格）；
- 合并时保留每个字段最富的值：最长的摘要、最全的作者列表、最大的引用数；
- 同时累计来源集合，记录这篇论文被哪几个库命中。

研镜 issue 里写的“DOI 优先，其次标题归一化”和行业一致，建议补一个中间键：arXiv ID。S2 的 `externalIds` 直接带 arXiv 字段；OpenAlex 对 arXiv 预印本也有索引记录，用 DOI 或归一化标题仍能对齐到同一篇论文，成本很低。

### 3.5 排序：引用数打底，多信号加权是进阶

scholar-megasearch 的五层排序是目前最完整的公开做法：来源一致性（provenance）、影响力（引用数 + 年龄归一化引用速度）、时效（年份）、完整度（DOI/PDF/摘要是否齐全）、相关性（query 与标题摘要的词重叠），再按 goal 调权重。

M2-3 的 MVP 建议简化为：相关性过滤 → 引用数降序 → 来源数、年份做 tie-breaker。这个排序对“找经典文献”够用，新论文吃亏的问题留给 M3 的加权版本。

### 3.6 限流与容错是工程重点

- Semantic Scholar：无 key 时共享匿名池，约 1 req/s，实践中经常 429；`/paper/search` 的 `limit` 最大 100。成熟客户端统一做法是进程内限流器（例如 1.05 s 间隔），429 时 sleep 5 s 重试，5xx 指数退避，尊重 `Retry-After`；配 key 后上限更高，key 只放环境变量。
- OpenAlex：完全免 key，但按积分限流：list 端点一次 10 积分，免费用户每天 100,000 积分、每秒最多 100 请求。加 `mailto` 参数进入 polite pool，响应更稳定；`per-page` 最大 200，用 `select` 只取需要的字段，批量 DOI 查询用 OR 语法一次合并 50 个。
- 故障隔离：单源失败不能让整个任务失败。scholar-megasearch 的兜底是“首选源 → 备用源 → 本地 fallback → 记录失败源并继续出部分结果”。研镜已规划的“单源失败自动兜底”与之一致，记得把失败源写进可观测日志。

### 3.7 人类审批与可观测性被反复强调

GPT-Researcher 多 agent 版专门保留 Human agent 监督；STORM 的 Co-STORM 让用户随时插话改方向；scholar-megasearch 要求如实报告哪些源失败、不许编造条目。研镜的审批点设计（Planner 审批、结果审批）天然符合这条共识，也是与黑盒 deep research 产品拉开差距的地方。

### 3.8 模型分工控制成本

STORM 建议用便宜模型做查询拆分和对话模拟，强模型写正文；Open Deep Researcher 也拆成摘要模型、研究模型、终稿模型。研镜的 pi SDK 运行时已经按角色拆模型配置。M2-3 检索阶段只让模型整理论文卡片 markdown，检索本身零模型成本，这一点要在方案里写清楚。

## 4. 对 M2-3 的结论

1. 方案 A（确定性检索管道）成立且有行业背书：检索核心用代码，模型只做关键词提取和结果整理。这是当前共识里的主流路线，不是妥协。
2. 字段归一化是双源接入第一步，两个 API 的字段差异（作者、年份、引用数、DOI、摘要、URL）统一成 `Paper` 结构后再去重。
3. 去重键用 DOI → arXiv ID → 归一化标题，合并保留最富字段并累计来源集合。
4. 排序用“引用数为主，来源数与年份为辅”，MVP 不引入模型精排。
5. 限流容错按 3.6 实现：S2 限流器 + 429 重试，OpenAlex polite pool + 字段裁剪；单源失败降级为另一源并记录。
6. 流程保持现状：Planner 审批 → Researcher 真实检索 → 生成论文卡片 → 用户审批 → Writer。中间产物（原始 API 响应、合并后的 corpus、失败源）都进可观测事件，这本身就是作品叙事的一部分。
7. 留给 M3 的增强按优先级：引用雪球（PaSa 和 scholar-megasearch L3 的做法，对 recall 提升最直接）→ 完整性批评 agent → 模型精排（PaSa Selector 思路）。这些可以在演示时作为下一步讲，但不在 M2-3 实现。

## 5. 需要留意的分歧

- 确定性 vs agentic：PaSa 证明强 agentic + 专门训练能显著提升 recall，但代价是成本、不可复现和工程复杂度。研镜选择确定性底座，不否定 agentic，而是把 agent 放在扩展层。
- S2 限流数字：不同来源对无 key、有 key 的具体 QPS 说法不一致（无 key 是 1 req/s 共享池或 100 req/5 min，有 key 是 1 req/s 或 10 req/s）。实现按最保守值做，key 做成可选环境变量。
- 排序公平性：纯引用数对新论文不友好。MVP 接受这个偏差，文档里写明，M3 加权。

## 6. 参考来源

- [PaSa 仓库](https://github.com/bytedance/pasa)，[PaSa 论文](https://arxiv.org/abs/2501.10120)
- [scholar-megasearch 仓库](https://github.com/TaewoooPark/scholar-megasearch)，[SKILL.md](https://github.com/TaewoooPark/scholar-megasearch/blob/main/skills/scholar-megasearch/SKILL.md)
- [STORM 仓库](https://github.com/stanford-oval/storm)，[STORM 论文](https://arxiv.org/abs/2402.14207)
- [GPT-Researcher 仓库](https://github.com/assafelovic/gpt-researcher)，[multi_agents 说明](https://github.com/assafelovic/gpt-researcher/blob/master/multi_agents/README.md)
- [Open Deep Researcher 仓库](https://github.com/langchain-ai/open_deep_research)
- [OpenAlex 限流与认证文档](https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication)
- [PaperOrchestra 仓库](https://github.com/Ar9av/PaperOrchestra)，[s2_search.py](https://github.com/Ar9av/PaperOrchestra/blob/main/skills/literature-review-agent/scripts/s2_search.py)
- [Semantic Scholar MCP 仓库](https://github.com/xiuyechen/semantic-scholar-mcp)
- [agent-skills-hub / openalex-database](https://github.com/agent-skills-hub/agent-skills-hub/tree/main/skills/openalex-database)
