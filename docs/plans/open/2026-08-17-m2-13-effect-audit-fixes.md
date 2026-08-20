---
title: M2-13 效果修复（plan）：核验批量 + 模型评估 + 全量下载
status: active
created: 2026-08-17
updated: 2026-08-17
issue: 2026-08-17-m2-13-effect-audit-fixes
areas: [server, web, shared, data]
---

# M2-13 效果修复（plan）

## 任务解释

把真实运行暴露的三个效果短板修掉：引用核验从“逐篇查 arXiv 被 429 打爆”改为批量查询 + 回退；
评估从“规则管道”升级为“模型评估”（新增 evaluator 角色，规则统计降级为参考输入）；
全文下载从“只试 top-8”改为“有 OA 候选全部尝试”。附带：检索排序加相关度因子、
元数据异常过滤、writer/reviewer 全文摘录一致性。

## 第一性原理

| 问题 | 第一性追问 | 基线 |
|------|-----------|------|
| 核验 11/12 因 arXiv 429 失败 | “核验”是查权威记录，不是测 arXiv 限流；12 个 ID 本可一次请求完成 | 批量 `id_list`（≤10/请求），一次 1-2 个请求 |
| 规则评估无区分度 | 评估的价值在“解释为什么”和“发现缺口”，规则只能给统计不能给判断 | 模型评估：逐概念判定 + 理由 + gap |
| 下载只试前 8 篇 | 下载是为了“能读全文”，有 OA 候选就该试；串行与上下文瓶颈已解除 | 全部有候选的论文并发下载 + 时间预算 |
| 纯引用数排名进边缘论文 | 相关度应与主题命中挂钩，但高引经典不能丢 | 引用数对数 + 命中主题词数加权 |

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 核验批量 | `ArxivClient.lookupMany(ids)`：`id_list` 批量（≤10/请求，分批），结果写入现有 verifierCache（`arxiv:<id>`），verifyOne 走缓存 | 逐篇 lookup（现状） | 12 篇核验从 12 次请求降到 1-2 次；缓存复用 M2-12 机制 |
| 核验回退 | arXiv 批量失败/429 用尽 → 有非 arXiv DOI 走 Crossref，否则标题+作者搜索（Crossref → S2） | 直接标 Unverifiable | 单点依赖变多源，Unverifiable 占比显著下降 |
| 评估角色 | 新增 `evaluator` 角色（writer 之后、reviewer 之前，`requiresApproval=false` 自动执行，独立会话） | 在 reviewer 会话里顺带评估 | 独立会话 + artifact 交接符合项目理念；评估可单独观测、可演示 |
| 评估输入 | `evaluation.ts` 重构为 `buildEvaluationInputs`（主题词集、大纲标题、引用统计、失败源统计等纯数据） | 保留规则结论 | 规则只当参考数据，不再出“判定” |
| 评估输出 | evaluator 按固定模板输出：逐核心概念命中（含理由）、逐卡相关度评分、逐章大纲覆盖（含内容锚点：章节至少引用 1 卡）、覆盖缺口与 gap、总体结论 | 自由文本 | 可解析、可展示、可注入 reviewer |
| 下载范围 | 去掉 `slice(0, readTop)` 截断；全部有 `resolvePdfUrls` 候选的论文并发（≤3）下载；新增 `SEARCH_DOWNLOAD_MAX`（默认 25）与整阶段时间预算 `SEARCH_DOWNLOAD_TIMEOUT_MS`（默认 240s） | writer 执行期间后台异步补齐（跨步骤队列复杂，留 M3）；Unpaywall 候选（外部 API，留 M3） | 时间/上下文瓶颈已解除；同步全量 + 预算最简单可靠 |
| 排序 | `score = log2(1+引用数) + SEARCH_RELEVANCE_WEIGHT × 命中主题词数`（默认权重 2.0，可配 0 恢复纯引用排序） | 纯引用数（现状）；模型精排（M3） | 确定性可复现；命中 1 词 ≈ 引用数翻倍，既保经典又提相关度 |
| 元数据过滤 | 过滤“无年份 && 无 DOI && 无 arXiv”的卡片（如 [7]），计入 `stats.skippedPapers` | 全部保留 | 损坏元数据进池会稀释相关度并误导 writer |
| 摘录一致性 | 摘录区头部显式声明“已读 N 篇，此处仅注入前 M 篇，其余仅可引摘要”；reviewer promptExtra 注入与前 3 篇相同的全文摘录 | reviewer 注入全部 7 篇摘录（上下文过大） | 消除“全文已读 7 vs 注入 3”混淆（C8）；让 reviewer 能核验全文级 claims（C3） |

## 实现步骤

1. **P0-1 核验批量**（server）
   - `arxiv.ts`：新增 `lookupMany(ids: string[])`，按 ≤10 个/请求分批拼 `id_list`，复用 `fetchFeed` 与 429 退避，返回 `Map<normalizedId, SearchPaper|null>`；
   - `citationVerifier.ts`：`verifyCitations` 先收集去重 arXiv ID（来自卡片），一次 `lookupMany` 后写入 verifierCache；`verifyOne` 的 resolve 链改为“arXiv 失败/无结果 → 有非 arXiv DOI 走 lookupDoi → 否则 searchByTitleAuthor”，不再因单源失败直接 Unverifiable。
2. **P0-2 evaluator 角色**（shared + server + web + data）
   - `shared/types.ts`：`Role` 增加 `'evaluator'`；
   - `server/src/index.ts`：`ROLES` 数组加 `'evaluator'`；
   - `runtime/piConfig.ts`：角色循环加 `'evaluator'`（`PI_MODEL_EVALUATOR` / `PI_THINKING_EVALUATOR`）；
   - `runtime/prompts.ts`：`ROLE_SYSTEM_PROMPTS['evaluator']`（固定模板）、`ARTIFACT_NAMES['evaluator'] = 'evaluation-report.md'`；
   - `evidence/evaluation.ts`：`buildEvaluationReport` 重构为 `buildEvaluationInputs`（保留 tokenize/extractThemeTokens 等统计函数），输出结构化参考数据；
   - `evidence/EvidenceStepService.ts`：新增 `prepareEvaluator`（卡片 + 草稿 + 规则参考数据 → promptExtra）；`prepareReviewer` 删除规则生成 evaluation artifact 的调用，改为读取 evaluator 产出的 `evaluation-report.md` 并注入；
   - `runtime/PiStepRunner.ts`：新增 evaluator 分支（调 `prepareEvaluator`）；
   - `runtime/MockStepRunner.ts`：evaluator case 产出 mock `evaluation-report.md`；
   - `web/src/api.ts`：默认五步模板（writer 后插入“评估证据”步骤，`requiresApproval: false`）；`web/src/components/StepTimeline.tsx`：`ROLE_LABELS` 加 `evaluator: '评估'`；
   - 打回语义不变：reviewer 打回 writer，evaluator 位于 writer 之后随其重跑。
3. **P1-1 全量下载**（server）
   - `researcherStep.ts`：去掉 `slice(0, readTop)`，改为全部有 `resolvePdfUrls` 候选的论文并发下载（≤3）；`SEARCH_DOWNLOAD_MAX` 与整阶段时间预算兜底，超预算未完成标记 `failed(timeout)`；
   - `config.ts`：新增 `downloadMax` / `downloadTimeoutMs`。
4. **P1-2 排序与过滤**（server）
   - `merge.ts`：`mergeAndRank` 增加可选主题词集参数，排序改为相关度加权 score；新增 `filterBrokenPapers`（无年份 && 无 DOI && 无 arXiv 剔除），stats 增加 `skippedPapers`；
   - `AcademicSearchService.ts`：从 plan 提取主题词传入 mergeAndRank；失败源统计保持不变（明细留在卡片，评估输入只给数量）。
5. **P2-1 摘录一致性**（server）
   - `EvidenceStepService.ts`：`buildFullTextExcerpts` 头部加“已读 N 篇，此处仅注入前 M 篇，其余仅可引摘要”；`prepareReviewer` 注入与前 3 篇相同的全文摘录区。
6. **测试**：见测试方案。
7. **文档**：architecture / runbook / INDEX 同步；`scripts/verify-m2-13.mjs` 新增。

## 测试方案

- arxiv：`lookupMany` mock fetch 断言 `id_list` 参数与分批（11 个 id → 2 次请求）；429 退避后成功；
- citationVerifier：批量后 verifyOne 命中缓存不再逐条请求（mock lookupArxiv 调用计数 = 1）；arXiv 失败回退 DOI / 搜索；
- evaluation：`buildEvaluationInputs` 输出结构化数据；旧规则报告函数不再被调用；
- evidence：`prepareEvaluator` promptExtra 含参考数据与模板要求；`prepareReviewer` 读取 evaluator 报告并注入摘录；摘录头部声明文本断言；
- researcherStep：全量下载断言（mock acquireFullText 对所有有候选论文调用）；`SEARCH_DOWNLOAD_MAX` 截断断言；
- merge：相关度权重排序断言 + 权重 0 恢复纯引用排序；元数据过滤断言（[7] 型卡片剔除 + `skippedPapers`）；
- web：`StepTimeline` 含 evaluator 标签；默认模板五步；
- MockStepRunner：evaluator 产出 mock 评估报告；
- 手动：`node scripts/verify-m2-13.mjs`（真实流程：核验通过率 ≥80%、评估报告由模型生成且含理由与 gap、全文覆盖 ≥12/15、卡片无 [7] 型损坏卡片）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：evaluator 角色、核验批量、评估模型化、下载覆盖；
- `docs/guide/runbook.md`：`SEARCH_DOWNLOAD_MAX` / `SEARCH_DOWNLOAD_TIMEOUT_MS` / `SEARCH_RELEVANCE_WEIGHT`、evaluator 角色说明、verify-m2-13；
- `docs/INDEX.md`：登记 M2-13 plan。

## 涉及 UI

新增“评估”步骤与角色标签，属步骤时间线行内改动：

```text
规划 → 检索 → 写作 → 评估 → 审查        （默认模板由四步变五步）
[规划] [检索] [写作] [评估] [审查]
  ✓      ✓      ✓    running  ⏸
```

- evaluator 步骤自动执行（无审批按钮），评估报告在现有“评估”产物分组展示；
- 无需新增页面，无 HTML 预览需求。

## 对抗性审查（plan review，2026-08-17）

审查视角：方案是否引入新瓶颈 / 模型评估是否可信 / 全量下载是否拖垮流程 / 改动面是否可控。

- [major] evaluator 使默认流程多一次模型调用（成本约 +¥0.3、耗时 +2-3 分钟）→ 评估本身是作品卖点，可接受；模板限长（≤1200 字）控制成本；`PI_THINKING_EVALUATOR` 可降档。
- [major] 模型评估可能“顺着草稿说好话”→ 模板强制逐概念判定 + 每条理由 + 至少列出 2 条覆盖缺口；规则统计作为参考输入对账锚点；验收要求评估报告能指出规则管道发现不了的缺口（C1 类）。
- [major] 全量下载推迟 researcher 出卡片时间（15 篇约 3-5 分钟）→ 并发 3 + 240s 预算兜底；预算内未完成标记 timeout 并继续流程，不阻塞。
- [minor] 排序权重改变既有 merge 行为 → 更新测试并记录；权重可配 0 恢复纯引用排序，runbook 注明。
- [minor] Role 类型扩展影响 web / MockStepRunner / 测试 → 同步修改，typecheck 兜底。
- [minor] 批量核验若 arXiv 整体 429 仍失败 → 批量后逐条回退 DOI / 标题搜索，保证 Unverifiable 占比下降（验收 ≥80% 可核验）。

## 预览

本地 `npm run dev`：http://localhost:5173（5173 被占用时自动 5174）。
