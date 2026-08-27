---
title: M2-12 可靠性与性能加固（plan）
status: archived
created: 2026-08-17
updated: 2026-08-17
issue: 2026-08-17-m2-12-reliability-performance
areas: [server, web]
---

# M2-12 可靠性与性能加固（plan）

## 任务解释

把四件事做实：全文下载又快又完整（必须成功、不允许半途而废）、检索并发受控提速、Writer 开最高思考强度并裁剪上下文、引用核验稳健可缓存，同时修掉对抗审查发现的可靠性隐患。

## 第一性原理

| 问题 | 第一性追问 | 基线 |
|------|-----------|------|
| 下载只试一个候选 | “下载成功”的定义是至少一个合法源给出完整文本，不是第一个源成功 | 多候选依次尝试，任一成功即成功，全败才失败并记原因 |
| 检索全并发 + 限流串行 | 并发上限应匹配限流器能力，否则并发只是排队 | 每源并发 ≤ 限流带宽，总耗时 ≈ 请求数 / 并发度 |
| Writer 未开思考 | 推理型任务应显式选择思考强度，而不是用默认值 | pi SDK 传 `thinkingLevel`，最高 `high`，按角色可配 |
| 上下文膨胀 | prompt 应只含“决策所需信息”，不是全部证据 | 全文摘录 + 打回只带结构摘要 |
| 核验依赖单源且无缓存 | 核验是“对权威源”，多源回退 + 结果复用 | Crossref → arXiv → S2；结果按 DOI/arXiv 缓存 |
| 审批无防重入 | 状态迁移必须原子，双击只能成功一次 | 乐观锁 UPDATE WHERE status=awaiting_approval |
| WS 断线丢事件 | 重连后状态必须与服务器对账 | 重连触发全量刷新 |

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 下载候选 | `resolvePdfUrls` 返回候选数组，依次尝试；每篇独立 Promise，并发 2-3 | 单候选 / 全并发 | 提高成功率又不打爆 OA 源 |
| 下载状态 | papers 表新增 `download_status`（ok / no_oa / failed）+ `download_error`；卡片与全文面板展示 | 只标“已读/仅摘要” | 用户能区分“本来没有”和“下载失败” |
| 校验 | 提取文本 ≥500 字符才算有效；页数解析失败视为无效 | 只要非空 | 挡“内容损坏/空白页” |
| 检索并发 | 每源信号量（同时 ≤3），仍走 RateLimiter | 去掉限流 | 并发提速但守礼貌 |
| 查询组 | 默认 `SEARCH_MAX_GROUPS` 10 → 8 | 全部保留 | 减查询量降耗时 |
| Writer 思考 | `createAgentSessionFromServices` 传 `thinkingLevel: xhigh`（DeepSeek 映射 `reasoning_effort=max`）；`PI_THINKING_LEVEL`（默认 xhigh）/ `PI_THINKING_<ROLE>` 可覆盖 | 全局 off / 仅 high | 用户要求最高强度；pi-ai 需在模型注册 `thinkingLevelMap: { high: 'high', xhigh: 'max' }` 才会放行 xhigh，否则会静默降级到 high |
| 全文注入 | 每篇摘录 3-5k 字符（标题、摘要、引言、结论段），只注入 top-3 全文摘录 + 其余摘要 | 全量 16 万字符 | 上下文减 70%+，writer 提速降本 |
| 打回注入 | 只注入 v1 结构摘要（章节 + 引用 + 意见响应） | v1 全文 | 避免打回后 prompt 翻倍 |
| 核验缓存 | 内存 Map（DOI/arXiv → 结果）+ 会话级 TTL；跨工作流复用 | 持久化表 | MVP 零 schema 侵入，够用 |
| 核验并发 | 每源限流内并发 2-3；arXiv 6s/次 + 429 退避 | 全串行 | 60s → 20s 量级 |
| 审批防重入 | `UPDATE steps SET status=? WHERE id=? AND status='awaiting_approval'`，changes=0 抛 409 | 纯内存检查 | 原子化，双击只成功一次 |
| WS 重连 | onopen 时 `refreshList()`（节流：仅断线重连触发） | 不刷新 | 消除陈旧状态 |
| 大纲匹配 | 词元重合（Jaccard ≥ 0.5 或包含任一核心词）；相关度改为命中主题词数的分布（均值 + 中位数） | 字面相等 | 容忍草稿改写标题 |

## 实现步骤

1. **fullText.ts**：`resolvePdfUrls(paper)` 返回去重候选数组；`acquireFullText` 依次尝试候选，任一成功即返回 `{ text, url, source }`；提取文本 <500 字符视为失败；`researcherStep` 并发 2-3 下载（信号量）。
2. **data**：papers 表加 `download_status` / `download_error`（migrate）；`Paper` 类型与仓储支持；`buildResearchCards` 每张卡片展示下载状态；`paper-fulltext.md` 头部加“成功 N / 失败 M（原因）”。
3. **AcademicSearchService**：每源并发信号量（≤3）；`SEARCH_MAX_GROUPS` 默认 8；失败源记录保留。
4. **PiRuntimeProvider**：模型注册加 `thinkingLevelMap: { high: 'high', xhigh: 'max' }`；`createAgentSessionFromServices` 传 `thinkingLevel`（`loadPiConfig` 新增，按角色 env 覆盖，默认 xhigh）。
5. **EvidenceStepService / PiStepRunner**：writer 全文注入改为摘录构建（每篇取标题、摘要、引言、结论段截断 3-5k，只注入 top-3 全文摘录）；打回时注入 v1 结构摘要（章节 + 引用 + 历史意见）。
6. **citationVerifier**：`createVerifierDeps` 增加 S2 兜底（有 key 才用）；arXiv 速率 6s + 429 重试；核验结果内存缓存（键 `doi:xxx` / `arxiv:xxx`）；并发 2-3。
7. **WorkflowEngine.decide**：乐观锁更新步骤状态，`changes=0` 抛 `EngineError('step_not_awaiting_approval', 409)`。
8. **store.ts**：WS `onopen` 时若此前断线过则 `refreshList()`。
9. **evaluation.ts**：大纲标题词元 Jaccard 匹配；相关度输出均值 + 中位数；`EVALUATION_TOPIC_GATE` 保持。
10. **测试 / 文档 / 验证脚本**：见清单。

## 测试方案

- fullText：多候选回退（首候选失败、次候选成功）；<500 字符判失败；并发下载结果一致；
- data：download_status 迁移与读写；
- search：并发信号量限流（并发请求数 ≤ 上限）；查询组默认 8；
- runtime：thinkingLevel 注入断言（mock 捕获参数，断言 xhigh 与 thinkingLevelMap）；角色覆盖；
- evidence：writer 摘录构建（不含全文尾部）；打回只带结构摘要；
- citationVerifier：429 退避（mock fetch 429 → 重试成功）；缓存命中不二次请求；S2 兜底；
- engine：并发双 approve 只成功一次（第二个 409）；恢复逻辑保持；
- store：断线重连触发刷新（节流）；
- evaluation：大纲 Jaccard 匹配（改写标题也能覆盖）；
- 手动：`node scripts/verify-m2-11.mjs`（下载成功率与耗时）、`verify-m2-12.mjs`（thinkingLevel、缓存命中、性能采样）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：下载状态、思考强度、核验缓存、并发池。
- `docs/guide/runbook.md`：`PI_THINKING_LEVEL`、`SEARCH_MAX_GROUPS`、verify-m2-12。
- `docs/INDEX.md`：登记 M2-12 issue/plan。

## 对抗性审查

- 日期：2026-08-17
- 审查角度：优化是否引入新瓶颈 / 是否真的提高成功率 / 配置是否可回退
- 发现与处理：
  - [major] 多候选下载会把请求量放大（每篇最多 4 个候选）→ 候选去重（DOI/arXiv 同源不重复）+ 全败才尝试下一候选，且并发 2-3 兜住；
  - [major] thinkingLevel xhigh（reasoning_effort=max）会显著增加推理 token 与耗时 → 按角色可配，默认全部角色 xhigh，可用 `PI_THINKING_<ROLE>` 按角色降级，且文档注明成本；
  - [major] 全文摘录可能丢掉论证关键段 → 摘录规则取“引言 + 结论 + 方法/实验开头”，保留截断标记，MVP 接受边界；
  - [minor] 核验缓存可能用过期的 Crossref 元数据 → 会话级 TTL（默认 24h）足够，MVP 不做持久化；
  - [minor] WS 重连刷新可能和 WS 增量竞争 → 刷新仅“断线重连”触发（非首次连接），并让 REST 结果覆盖增量；
  - [minor] 乐观锁需要 better-sqlite3 changes 语义确认 → 实现时用 `db.prepare(...).run()` 的 changes 判断，加单测；
  - [minor] S2 兜底无 key 时不稳定 → 仅在有 `SEMANTIC_SCHOLAR_API_KEY` 时启用，否则跳过。

## 涉及 UI

全文面板新增“下载状态：成功/失败原因”展示，属于 EvidencePanel / 卡片行内改动，无新增页面。

## 实现复核（2026-08-17）

实际实现与决策一致，补充三点：

- **思考强度已实测**：pi-ai 0.80.3 的 `getSupportedThinkingLevels` 仅在模型声明 `thinkingLevelMap.xhigh` 时才放行 xhigh；`openai-completions` 会把 `thinkingLevelMap['xhigh']`（`max`）写入请求的 `reasoning_effort`。本次已按此注册并注入，`scripts/verify-m2-12.mjs` 离线检查通过。
- **打回结构摘要口径**：plan 决策为“打回只带 v1 结构摘要”；实现为“带修改意见重跑时，草稿一律只注入结构摘要（章节 + 引用 + 篇幅）”，无意见时仅历史版本摘要、最新版全量，保证首版修订仍可见原文、迭代版本不膨胀。
- **M2-9 口径修正**：M2-9 issue 原写“Crossref → PubMed → Semantic Scholar → Web 兜底”，实现收窄为 Crossref/arXiv 字段级交叉；本次核验升级补齐 S2 兜底与结果缓存，实际链路为 DOI/arXiv（缓存）→ 标题+作者检索（Crossref → S2），与 M2-9 的多源交叉语义重新对齐。
