---
title: M2-15 模糊问题澄清 + 标题摘要筛选 + 华为赛题性能吸收（plan）
status: active
created: 2026-08-18
updated: 2026-08-20
issue: 2026-08-18-m2-15-clarify-and-select-papers
areas: [server, web, scripts]
---

# M2-15 模糊问题澄清 + 标题摘要筛选 + 华为赛题性能吸收（plan）

## 任务摘要

解决“召回高、精度低、效果难证明”三个问题：宽泛问题在规划阶段先向用户澄清锚定点再检索；
新增 selector 角色对候选池做“标题 + 摘要”批量筛选并按相关度分级，只有入选论文才下载全文；
深度吸收华为赛题思路（RefChain 子问题检索、同义词扩展、时间范围过滤、gap 驱动二次检索、引文雪球），
并补齐评测脚本与成本报告，把性能提升落到可量化指标上。

## 为什么做（原因）

M2-14 真实运行：召回 1113/797 达成，但 top-15 混入“太极统一场论”“谣言传播”“大学英语教学”等
5-6 篇明显无关论文，模型评估与审查因此打回。根因是两层策略缺失：

1. 问题拆解：planner 对模糊问题不提问，直接抓关键词开搜，锚点没有先和用户对齐；
2. 筛选方法论：论文标题与摘要是判断是否值得读全文的第一依据，当前是“全量下载 + 引用数/主题词加权”，
   缺少“批量深入分析标题摘要（内容、场景、创新点）”的筛选环节。

另外 M2-14 有 3/9 论文因只有 1 个 PDF 候选而下载失败，需补候选源。

华为赛题（科研场景复杂学术查询的智能论文搜索与推荐）给出的思路与资源，恰好是本项目短板的解法：

- SPAR RefChain（子问题即子查询）：当前 planner 的子问题只用于综述大纲，未进入检索，召回面白白收窄；
- SPAR 查询演化 / PaSa 迭代检索：当前是单轮检索、无反馈回路，找不到的内容只能靠“检索一次”；
- PaSa Crawler / Ai2 引文追踪：当前无引文网络探索，而 OpenAlex `cites:` / `referenced_works` 是免费 API；
- LitSearch / AstaBench / RealScholarQuery：当前没有评测基准，效果无法向评委/导师量化证明；
- 华为评分 20% 给运行效率（API 调用次数、token、延时），当前 usage_records 已落库但没有聚合报告。

## 预计效果

- 宽泛问题：第一轮 plan 含“澄清请求”，用户审批意见回答后，第二轮 plan 锚点明显收敛
  （关键词组 ≥5 且包含领域/场景实体）；
- 入选精度：top-15 明显无关论文从 M2-14 的 5-6 篇降到 ≤2 篇（不再出现“太极统一场论”类条目），
  且高相关占比 ≥60%（相关度分级进入排序后）；
- 检索广度：查询组 = 关键词组 ∪ 子问题组（去重，上限 10），RAG/LLM 类缩写查询命中面扩大；
- 时间过滤：plan 含时间范围时 OpenAlex/S2 请求带年份参数，旧噪声下降，近 5 年占比可量化；
- 引文雪球：top-3 入选论文经 OpenAlex 被引/参考文献补充候选（上限 20），去重合并后候选池扩展、重复率 <5%；
- 下载：单候选论文失败率下降（Unpaywall）；候选池 30-50 篇 + selector 模型筛选，
  整体耗时预算 ≤20 分钟、成本增量 ≤¥0.5；
- 评测：eval-m2-15 输出 recall@20 / precision / 核验率 / 每查询成本延时指标表
  （LitSearch 子集 + 自建查询），含“无迭代版”基线与分级消融对比；
- 成本报告：单次工作流 API 调用次数 / token / ¥ / 耗时写入文档指标表（对齐华为 20% 效率分）。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 模糊检测 | planner 模型自判（prompt 规则：缺领域/对象类型/场景/时间范围任一即输出“澄清请求”小节） | 纯规则检测关键词数量 | 模糊是语义问题，模型自判更准；规则误触发由用户在审批意见直接回答可回退 |
| 澄清交互 | 复用现有审批机制：plan 含“澄清请求”+ UI 审批面板提示条，用户以审批意见回答，planner 重跑吸收 | 新增独立澄清对话状态机 | 零状态机改动，符合“人只做决策”的流程 |
| 流程拆分 | researcher 只产出“检索候选池”（30-50 篇标题+摘要，不下载）；新增 selector 角色（模型筛选 → research-cards.md → 代码触发入选下载） | 维持“检索即下载” | 先筛后下，下载只花在值得读的论文上 |
| selector 审批 | 自动执行（requiresApproval=false），入选理由进卡片、剔除清单进候选 artifact | selector 也设为审批点 | 避免打断流程；writer/evaluator/reviewer 兜底纠偏 |
| 编号解析 | selector 输出按 `### [N]` 解析；解析失败时回退“全部候选下载”安全网 | 解析失败即报错 | 模型输出不稳定时保证流程不中断 |
| Unpaywall | `SEARCH_UNPAYWALL_EMAIL` 可配，DOI 存在且无候选/候选失败时查询补 PDF 候选 | 默认不启用 | 依赖外部 API，失败静默不影响主流程 |
| 子问题检索 | 关键词组与子问题组合并去重（上限 `SEARCH_MAX_GROUPS=10`）进入查询 | 只保留关键词组 | RefChain 思路落地成本≈0；宽泛问题子问题常比关键词更接近锚点 |
| 同义词扩展 | 确定性缩写映射表（LLM→large language model、RAG→retrieval-augmented generation 等），每组至多 +2 条扩展查询 | 模型在线改写 | 免费稳定；模型改写留 M3 |
| 时间过滤 | 解析 plan 时间范围（明确年份 / 近 N 年）→ OpenAlex `from_publication_date` / S2 `year`；解析失败不加过滤 | 全量不过滤 | 减少旧噪声；解析失败有安全网不阻断 |
| 相关度分级 | selector 输出“高度相关/部分相关”分级，作为排序首要信号，引用数退为 tie-breaker | 只用引用数/主题词 | 对齐华为“细粒度相关性评估”；分级带理由可回溯、可消融 |
| gap 二次检索 | selector 输出“二次检索建议”（2-4 条）→ 确定性补检索 → 合并去重 → 仅对新候选重筛 1 次 | 多轮迭代直至无 gap | 单次闭环提升精度，成本可控（+1 次模型调用） |
| 引文雪球 | top-3 入选论文经 OpenAlex `cites:` / `referenced_works` 补候选（上限 20） | 不做 / 全量雪球 | 免费 API 提升召回；限 top-3 控成本 |
| 评测范围 | LitSearch 子集 20-30 条离线 recall@20/precision + 自建 10-20 条 + 2-3 次完整工作流核验率/成本 | 全量 LitSearch + 全流程全跑 | 12 天约束下可执行、可量化 |
| 成本报告 | 新增 usage_records workflow 维度聚合 + scripts/cost-report.mjs，写入文档指标表 | 只口头汇报 | 对齐华为 20% 效率分；答辩/实习都有数据支撑 |

## Review 发现与修正

> 已完成两轮独立对抗性审查（第一轮覆盖原始范围，第二轮覆盖华为赛题吸收扩展），逐条记录如下。

### 第一轮（原始范围）

- [major] selector 模型筛选可能漏选/错选，错误传导到 writer → 修正：规则预筛（主题词命中）保留为第一层；
  每篇入选卡片强制附理由；剔除清单落 artifact 可回溯；writer/evaluator/reviewer 三层兜底。
- [major] 候选池 40 篇 + 模型筛选增加耗时与成本 → 修正：每篇理由限 120 字模板输出、摘要截断 300 字，
  预估增量 2-3 分钟、¥0.3-0.5；检索阶段去掉全量下载抵消部分耗时。
- [major] planner 澄清可能误触发（精确问题也提问）→ 修正：仅当问题缺领域/场景/对象类型锚点时触发；
  误触发时用户直接在审批意见回答即可，不阻塞；无澄清请求时行为与现状一致。
- [minor] selector 输出格式不稳定 → 修正：编号解析失败回退“全部候选下载”，保证卡片与全文不缺失。
- [minor] Unpaywall 依赖外部服务 → 修正：可配开关、失败静默、不影响主流程。

### 第二轮（华为赛题吸收扩展）

- [major] 子问题并入 + 同义词扩展会使查询数翻倍（8 → 可能 16+ 组 × 4 源），耗时成本不可控 →
  修正：maxGroups 上限 10（`SEARCH_MAX_GROUPS` 可配）、同义词每组至多 +2、去重后再计数；
  时间过滤本身降低每源结果噪音；预算 ≤20 分钟 / ¥0.5 进验收。
- [major] gap 二次检索 + 引文雪球 + selector 重筛会多 3 次以上模型/API 往返，结果合并复杂 →
  修正：二次检索查询上限 4、雪球上限 20、重筛仅对新增候选且只 1 次（防无限迭代）；
  合并统一走 mergeAndRank（doi/标题去重）后校验重复率 <5%。
- [major] LitSearch 离线评测 20-30 条 × 4 源仍有 10-15 分钟耗时与网络依赖 →
  修正：评测脚本支持 `--limit` / `--queries-file` / 结果缓存（data/eval/cache/），失败源容错；
  gold 子集下载后提交仓库（data/eval/），运行时不依赖外部网络。
- [minor] 相关度分级是模型主观输出，直接作为排序信号可能放大误判 →
  修正：分级保留理由字段、可回溯；评测报告含“分级 vs 无分级”消融对比；writer/evaluator/reviewer 兜底。
- [minor] 时间范围解析可能误读自然语言（如“2020 年之后”）→ 修正：仅解析明确年份 / 近 N 年，
  解析失败静默不加过滤，并在检索概览中体现。
- [minor] usage_records 已落库但无聚合查询 → 修正：新增 workflow 维度 SQL 聚合（sum/max），
  成本报告脚本直接复用。
- 未发现其他遗留风险。

## 实现步骤

1. **P0-1 规划澄清（planner + web）**
   - `prompts.ts`：planner 系统提示词增加澄清规则（缺领域/对象类型/场景/时间范围 → 输出“## 澄清请求”小节，
     只列 2-4 个问题，不展开搜索计划）；
   - `ApprovalPanel.tsx`：检测最新 `01-plan.md` 含“澄清请求”时显示提示条
     “该计划需要澄清，请在意见中回答以下问题”，并渲染问题列表；
   - 默认模板不变（planner 仍需审批），用户回答走既有 modify 流程。
2. **P0-2 selector 角色与流程拆分（shared + server + web）**
   - `shared/types.ts`：`Role` 加 `'selector'`；`Paper` 加 `relevanceLevel?: 'high' | 'partial' | null`；
   - `index.ts` / `piConfig.ts`：ROLES、角色循环加 `'selector'`（`PI_MODEL_SELECTOR` / `PI_THINKING_SELECTOR`）；
   - `prompts.ts`：`ROLE_SYSTEM_PROMPTS['selector']`（逐篇模板：内容/场景/创新点/相关度分级/入选或剔除 + 理由，
     输出 `research-cards.md`；文末“## 二次检索建议”小节，2-4 条建议查询）；
   - `researcherStep.ts`：改为产出 `research-candidates.md`（候选池 30-50 篇，标题+摘要，摘要缺失补抓或剔除），
     不再下载全文、不再产出 research-cards.md；
   - 新增 SelectorStepService（或并入 EvidenceStepService）：候选池 + plan 锚点 → promptExtra；
     模型输出后解析入选编号 → 对入选论文执行 `acquireFullText`（并发 3）→ 回填卡片状态行与分级 →
     落库 `research-cards.md` 与 `paper-fulltext.md`；
   - `PiStepRunner.ts`：selector 分支（模型调用 + 确定性下载回填）；`MockStepRunner`：selector case；
   - `config.ts`：`candidateTop`（`SEARCH_CANDIDATE_TOP` 默认 40）；
   - `web`：默认模板六步（researcher 后插“筛选证据”步骤，`requiresApproval=false`）；
     `StepTimeline.tsx`：`selector: '筛选'`；
   - 打回语义不变：researcher 打回重跑候选池 → selector 重跑；writer 打回只重跑 writer 及之后。
3. **P0-3 华为赛题性能吸收（search + shared + server）**
   - 3.1 `keywords.ts`：`extractKeywordGroups` 合并“检索关键词 + 子问题”两组（去重、上限
     `SEARCH_MAX_GROUPS` 默认 10）；`expandKeywordQueries` 增加 `SYNONYM_MAP` 确定性扩展
     （LLM/RAG/多智能体等缩写→全称，每组至多 +2）；新增 `parseTimeRange(planMd)`
     （明确年份区间 / 近 N 年；解析失败返回 null）。
   - 3.2 检索客户端时间过滤：`AcademicSearchClient.search` 增加可选
     `filters?: { yearFrom?: number; yearTo?: number }`（类型签名兼容，默认忽略）；
     OpenAlex 追加 `filter=from_publication_date:YYYY-MM-DD`、S2 追加 `year=`；Crossref/arXiv 忽略。
   - 3.3 `AcademicSearchService`：`SearchOptions` 增加 `gapQueries?: string[]`（追加查询组）；
     `mergeAndRank` 支持 `relevanceLevel` 优先排序、引用数退为 tie-breaker；
     `SearchStats` 增加 `gapQueries` 计数。
   - 3.4 引文雪球：`OpenAlexClient` 新增 `citedBy(workId, limit)`（`filter=cites:W{id}`）、
     `worksByIds(ids)`（`filter=openalex:W1|W2`）、`referencesOf(workId)`（`select=referenced_works`）；
     researcherStep 对入选 top-3 论文执行雪球 → `mergeAndRank` 去重合并进候选池。
   - 3.5 gap 闭环：researcherStep 解析 selector“二次检索建议”→ 调 `search({ gapQueries })` →
     合并 → 仅对新候选重筛（1 次）→ 产出最终 `research-cards.md`。
4. **P1-1 Unpaywall（server）**
   - `config.ts`：`unpaywallEmail`（`SEARCH_UNPAYWALL_EMAIL`，默认空）；
   - `fullText.ts`：`resolvePdfUrls` 在无候选或候选失败时，若有 DOI + 配置 email，查询
     `https://api.unpaywall.org/v2/{doi}?email=` 取 `best_oa_location.url_for_pdf` 追加候选（失败静默）。
5. **P1-2 评测与成本（scripts + data + docs）**
   - 5.1 `data/eval/`：LitSearch 子集（20-30 条，下载后提交）+ 自建 `queries.jsonl` / `gold.jsonl`
     （10-20 条，宽泛 + 精确混合，含时间范围标注）。
   - 5.2 `scripts/eval-m2-15.mjs`：离线跑确定性检索 → recall@20 / precision；2-3 条完整工作流 →
     核验率与成本（usage_records 聚合）；输出指标表 + “无迭代版”基线对比 + 分级消融；
     支持 `--limit` / `--queries-file` / 结果缓存。
   - 5.3 `scripts/cost-report.mjs` + data 层 workflow 维度聚合：API 调用次数 / token / ¥ / 耗时，
     写入 `docs/research/` 指标表。
6. **测试 / 文档 / 验证脚本**：见下。

## 测试与验证方案

- 单元测试：
  - keywords：关键词+子问题合并去重与上限；SYNONYM_MAP 扩展数量上限；parseTimeRange
    （年份区间 / 近 N 年 / 解析失败安全网）；
  - 检索客户端：openAlex/S2 请求 URL 含年份过滤参数；crossref/arxiv 忽略 filters；
  - mergeAndRank：高相关排在“引用数更高但部分相关”之前；
  - OpenAlexClient：citedBy / worksByIds 的 URL 与 limit 断言（mock fetch）；
  - researcherStep：gapQueries 触发二次检索、雪球合并去重、selector 重筛仅新候选；
  - selector prompt：相关度分级 + 二次检索建议小节断言（prompts 快照）；
  - usage 聚合：workflow 维度 sum/max SQL 正确；
  - web：审批面板对含“澄清请求”的 plan 显示提示条；默认模板六步；StepTimeline 含 selector 标签。
- 真实运行：`node scripts/verify-m2-15.mjs`——(a) 宽泛问题“研究下什么是 agent”第一轮 plan 含澄清请求，
  用审批意见回答后第二轮锚点收敛；(b) 完整六步流程 top-15 无明显无关论文、卡片带分级与筛选理由；
  (c) `node scripts/eval-m2-15.mjs --limit 5` 冒烟输出指标表。
- CI：typecheck + test 全绿。

## 验收标准

- [ ] 宽泛问题第一轮 plan 含“澄清请求”，意见回答后第二轮锚点明显收敛
- [ ] 真实运行候选池 30-50 篇，top-15 明显无关论文 ≤2（无“太极统一场论”类条目），
  高相关占比 ≥60%
- [ ] 每张入选卡片附筛选理由与相关度分级；剔除清单可回溯
- [ ] 检索查询组 = 关键词 ∪ 子问题（stats 可查）；RAG/LLM 缩写扩展生效（单测断言）
- [ ] plan 含时间范围时 OpenAlex/S2 请求带年份过滤（单测断言）
- [ ] gap 二次检索 + 引文雪球后候选池扩展、去重重复率 <5%（真实运行统计）
- [ ] selector 编号解析失败时回退全量下载，卡片/全文不缺失
- [ ] Unpaywall 生效后单候选论文下载失败率下降
- [ ] eval-m2-15 输出 recall@20 / precision / 核验率 / 每查询成本延时指标表，含基线与消融对比
- [ ] 成本报告写入文档指标表（API 调用次数 / token / ¥ / 耗时）
- [ ] typecheck / test 全绿

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：selector 角色、候选池拆分、澄清流程、RefChain 查询组、
  时间过滤、引文雪球、相关度分级排序、二次检索、Unpaywall；
- `docs/guide/runbook.md`：`SEARCH_CANDIDATE_TOP`、`SEARCH_MAX_GROUPS`、`SEARCH_UNPAYWALL_EMAIL`、
  `PI_MODEL_SELECTOR`、eval/cost 脚本用法、澄清交互说明、verify-m2-15；
- `docs/research/`（新增或更新）：评测指标表 + 成本报告；
- `docs/INDEX.md`：登记 M2-15 plan 更新。

## 涉及 UI / 预览

两处小改动（线框图，与上一版一致）：

```text
规划 → 检索 → 筛选 → 写作 → 评估 → 审查        （默认模板由五步变六步）
[规划] [检索] [筛选] [写作] [评估] [审查]
  ✓      ✓    running  ⏸

审批面板（plan 含“澄清请求”时）：
┌──────────────────────────────────────────────┐
│ ⚠ 该计划需要澄清，请在意见中回答以下问题：     │
│   1. 你关注的 agent 类型是？（单/多智能体）    │
│   2. 应用场景或领域是？                       │
└──────────────────────────────────────────────┘
```

评测与成本报告为 CLI + 文档输出，不进 UI。本地预览：`npm run dev` → http://localhost:5173。
