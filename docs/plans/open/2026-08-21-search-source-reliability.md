---
title: 检索层修复：源降级补偿 + Crossref 噪声过滤（plan）
status: active
created: 2026-08-21
updated: 2026-08-21
issue:
  - "docs/issues/open/2026-08-21-search-source-reliability.md"
  - "docs/issues/open/2026-08-21-crossref-noise-filter.md"
areas: [server, docs]
---

# 检索层修复：源降级补偿 + Crossref 噪声过滤（plan）

## 任务摘要

修复两个影响检索效果的 bug：一是 OpenAlex 计费额度耗尽、Semantic Scholar 无 key 限流
导致"源半瘫 + 每次查询浪费 7-15s 无谓重试"，改成"预算型 429 快速失败 + 降级补偿"；
二是 Crossref 把 Table/Figure/Supplementary 图表标题当论文返回、挤占候选池，在归一化
阶段过滤。修完后用 LitSearch 30 条复测，量化 recall@20 与单查询耗时的变化。

## 为什么做（原因）

证据来自 LitSearch 30 条离线评测（2026-08-20）：

1. 每条查询都出现 `openalex(T1) 失败 1 个查询、semantic-scholar(T2) 失败 1 个查询`；
   直接 curl 复现：OpenAlex 返回 `429 Insufficient budget`（计费制，免费预算 ≈$0.0001/日），
   S2 无 key 返回 `429 Too Many Requests`。实际只有 Crossref + arXiv 两个源在贡献候选，
   recall@20 被系统性压到 6.7%（官方 BM25 基线 ≈56%）。
2. `fetchJson` 对 429 默认重试 3 次：OpenAlex 每次 ≈7s、S2 每次 ≈15s（retry 5s 间隔），
   预算型 429 重试永远不可能成功，纯属浪费；单查询 ≈20s 中相当一部分是无谓重试。
3. lit-1 查询 top-20 几乎全是 "Table 4: …"、"Figure 11: …"、"Supplementary file 3. …"
   这类 Crossref 收录的图表条目（元数据完整、能通过现有 filterBrokenPapers），
   挤占有效候选位置，直接压低 recall 并增加 selector 噪声。

## 预计效果

- 单查询平均耗时：≈20s → ≤13s（消除 OpenAlex ~7s 与 S2 ~15s 的无谓重试，最慢源不再拖底）；
- `failedSources` 不再每条必现 OpenAlex/S2：OpenAlex 明确记为"降级（预算不足）"、
  S2 无 key 记为"降级（无 key）"，且计入新的 `degradedSources` 字段；
- 源永久失效时，存活源收到补偿查询（`compensatedQueries` 可观测），候选池不再
  结构性缺失一个源；
- Crossref 候选纯净度：lit-1 类查询 top-20 不再出现 Table/Figure/Supplementary 图表条目；
- LitSearch 30 条复测：recall@20 与单查询耗时的前后差异有量化记录（预期 recall 回升，
  具体数值复测后如实写入报告，不预设）；
- typecheck / test 全绿。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| OpenAlex 预算问题 | 识别"预算型 429"快速失败（零重试）+ 其他源补偿 | 给 OpenAlex 充值 / 采购 credits | 竞赛不承担无谓成本；Crossref+arXiv+S2 已覆盖主要学术库 |
| S2 无 key 行为 | 降级为 T3：单次尝试、零重试、失败不计入 failedSources | 直接禁用 S2 / 维持现状重试 | 无 key 时共享免费池偶发可用，保留价值但不付 15s 重试税；配 key 后自动升 T1 |
| 补偿触发条件 | 仅"非可重试失败（预算 429 等）或熔断跳过"发生后补偿 | 启动前健康探测 / 单次瞬时失败即补偿 | 探测本身消耗预算与时间；补偿只针对稳定失效，避免成本翻倍 |
| 补偿方式 | 失败源的任务重跑在存活源上（limit=compensatePerQuery） | 提高存活源默认 per-query | 只增加实际需要补偿的查询，行为可观测 |
| Crossref 过滤位置 | 仅 `search()` 归一化阶段过滤（type=component + 标题启发式） | `lookup()` 也过滤 | 引用核验需要能解析组件 DOI（图/表也可能被引用） |
| 过滤规则强度 | 前缀 + 强结构信号（digit+colon / "file N." / type=component）同时满足才过滤 | 仅前缀匹配 | 防止误杀 "Table-based…"、"Figure Ground…" 等合法论文标题 |
| plan 组织 | 一个 plan 覆盖两个 issue | 两个独立 plan | 同属检索层、同一复测，避免重复上下文与评审成本 |

## Review 发现与修正

> 自审（对抗性）：写完初稿后逐条挑战"补偿真的会发生吗 / 过滤会不会误杀 / 报告是否仍误导"。

- [major] 补偿条件若按"熔断（连续 3 次失败）后触发"，单查询每源通常只有 1 个任务，
  永远不会熔断 → 补偿形同虚设。修正：预算型 429 等"非可重试错误"单独计数，
  出现 1 次即视为该源本次稳定失效并触发补偿。
- [major] Crossref 标题前缀启发式会误杀 "Table-based Methods…"、"Figure Ground Revisited"
  这类合法标题。修正：必须"前缀 + 强结构信号"或 type=component 同时成立才过滤，
  并写回归测试锁定。
- [minor] 无 key 的 S2 偶发可用（共享免费池），若按 T3 处理但失败仍计入 failedSources，
  报告继续误导。修正：T3 的失败统一进 `degradedSources`，不再污染 failedSources。
- [minor] 补偿会重复调用已成功的源 → 成本上升。修正：仅对稳定失效源触发，
  且 `compensatedQueries` 进 stats，成本变化可观测。
- [minor] `SearchStats` 新增字段需向后兼容：全部设为可选字段，web 端无消费侧改动。
- [minor] OpenAlex 免费预算按 UTC 午夜重置，复测若跨天，预算状态不同会污染对比。
  修正：复测记录 UTC 时段；若预算已恢复，OpenAlex 可能恢复贡献，如实分口径记录。

## 实现步骤

1. `apps/server/src/search/http.ts`：429 分类——读取 body，命中
   `insufficient budget / rate limit exceeded + (budget|credits|prepaid)` 判定为
   "非可重试 429"，`SearchHttpError` 增加 `nonRetryable` 标记并立即抛出（不重试）；
   其余 429/5xx 维持现有重试逻辑。
2. `apps/server/src/search/config.ts`：新增
   `compensateOnDegrade`（默认 true）、`sourceDegradeCooldownMs`（默认 300_000）
   两个配置项（env 可覆盖）。
3. `apps/server/src/search/sources.ts`：无 `semanticScholarApiKey` 时 S2 tier 改为 `T3`；
   `selectForDomain` 透出 T3 语义。
4. `apps/server/src/search/semanticScholar.ts`：T3（无 key）时 `maxRetries: 0`，
   429 立即失败；有 key 行为不变。
5. `apps/server/src/search/AcademicSearchService.ts`：
   - `runPerSourceConcurrent` 支持"非可重试错误 1 次即熔断"；
   - 首轮结果汇总后，若存在稳定失效源且存活源 > 0 且 `compensateOnDegrade`，
     把失效源的任务重跑在存活源上（limit=`compensatePerQuery`），合并结果；
   - stats 新增 `degradedSources`（含 T3 源与预算失效源）与 `compensatedQueries`；
   - failedSources 只记真实失败（T3 降级不再计入）。
6. `packages/shared/src/types.ts`：`SearchStats` 增加可选字段
   `degradedSources?: string[]`、`compensatedQueries?: number`。
7. `apps/server/src/search/crossref.ts`：新增 `isCrossrefNoise(title, type)`：
   - type 为 `component` 直接过滤；
   - 标题匹配 `^(table|figure|fig\.?|supplementary( material| file| information)?|supporting information)\b`
     且满足强结构信号（`\d\s*[:.]` 或 `file\s+\d+`）→ 过滤；
   - 仅 `search()` 应用，`lookup()` 不应用。
8. 测试用例（见下节）；`typecheck` + `test` 全绿。
9. 复测：`npx tsx scripts/eval-m2-15.mjs --litsearch data/eval/litsearch-queries-sample30.jsonl
   --out data/eval/report-litsearch-30.md`，与修复前（6.7% / ≈20s）对比，
   结果写入 `docs/research/2026-08-21-effect-baseline.md`。

## 测试与验证方案

- 单元测试（`apps/server/test/search/`）：
  - `clients.test.ts`：OpenAlex 预算 429 → fetch 只调用 1 次（不重试）；
    S2 无 key → maxRetries=0、429 立即抛错；Crossref 噪声样例（
    "Table 4: Evaluation metrics…" / "Figure 11: …" / "Supplementary file 3. …"
    被过滤）与回归样例（"Table-based Methods…" / "Figure Ground Revisited"
    保留）；`lookup()` 不受过滤影响。
  - `service.test.ts`：mock 某源稳定失效 → 存活源收到补偿查询、
    stats 含 `degradedSources` / `compensatedQueries`、failedSources 不含 T3 降级源。
- 真实运行：LitSearch 30 条复测（同一样本），记录 recall@20 / 单查询耗时 / 降级源。
- CI：`npm run typecheck` + `npm test` 全绿。

## 验收标准

- [ ] OpenAlex 预算型 429 不再重试：单查询耗时实测 ≤13s（修复前 ≈20s）；
- [ ] `failedSources` 不再每条必现 OpenAlex/S2；降级源进入 `degradedSources`；
- [ ] 稳定失效时存活源补偿可观测（`compensatedQueries` > 0 且有日志证据）；
- [ ] lit-1 类查询 top-20 无 Table/Figure/Supplementary 图表条目；
- [ ] "Table-based…"、"Figure Ground…" 类合法标题不被过滤（回归测试通过）；
- [ ] LitSearch 30 条复测的 recall@20 与耗时差异写入效果基线文档；
- [ ] typecheck / test 全绿。

## 文档更新清单

- `docs/guide/runbook.md`：S2 API key 申请与配置、OpenAlex 预算说明、新环境变量；
- `docs/research/2026-08-21-effect-baseline.md`：复测前后对比数据；
- `docs/INDEX.md`：登记本 plan。

## 涉及 UI / 预览

无页面改动（检索层修复）；复测后通过本地服务（http://localhost:3000）与
评测报告呈现效果。
