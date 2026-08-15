---
title: M2-7 检索迭代、全文证据与写作质量闭环（plan）
status: active
created: 2026-08-15
updated: 2026-08-15
issue: 2026-08-15-m2-7-search-iteration-evidence-loop
areas: [server, data, shared, web]
---

# M2-7 检索迭代、全文证据与写作质量闭环（plan）

## 任务解释

把真实运行暴露的五个问题一次收口：规划改用 deepseek-v4-pro 深度拆解“锚定点”；检索用足关键词、新增 arXiv / Crossref 并支持打回补偿；下载 top-N 论文全文给 Writer；证据池多版本合并 + 引用格式强约束；自动生成评估报告并在 UI 展示。

## UI 线框图

```text
┌──────────────────────────────────────────────────┐
│ 证据 / 引用（评估）                               │
│ 检索：命中 63 / 去重 58 / 失败源 1                │
│ 证据池：v1(15) + v2(8) → 合并 21 篇               │
│ 全文：已读 8 / 仅摘要 7                            │
│ 引用：有效 18 / 越界 0 / 格式异常 0                │
│ 大纲覆盖：8 / 10 章节                              │
└──────────────────────────────────────────────────┘
审批（Reviewer 步骤）：
[通过] [打回修改] [打回 Writer 并附审查意见] [取消任务]
```

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| Planner 模型 | 默认 `deepseek-v4-pro`（`PI_MODEL_PLANNER` 可覆盖） | 维持 flash | 用户要求深度拆解；角色级模型覆盖机制已具备 |
| 锚定点 | 计划新增“锚定点”小节；打回时先输出“锚点修订” | 只改关键词 | 检索质量取决于问题锚定 |
| 关键词使用 | 全部关键词组（上限 10），组内按 `/` 拆中英文 | 只用前 3 组 | 真实运行证明前 3 组不够 |
| 打回补偿 | feedback 非空 → per-query 提到 50、启用引用数下限过滤、补用未用关键词组 | 固定参数重跑 | 让“打回”真正改变策略 |
| 数据源 | Semantic Scholar / OpenAlex / arXiv / Crossref | 维持双源 | 提高数量与覆盖 |
| 全文阅读 | top-8 论文下载 PDF、提取文本存 `papers.full_text`，Writer 注入截断全文 | 独立 Reader 角色 | 直接解决“没读就写”；Reader 角色留 M3 |
| 证据池 | 多版本 research-cards 合并去重，标注来源版本 | 最新版替换旧版 | 修复本次版本错位问题 |
| 引用格式 | prompt 强制纯数字 `[n]`；lint 兼容 `[V1-n]` 并标记格式异常 | 只加正则 / 只改提示词 | 双保险 |
| 评估 | 自动生成 `evaluation-report.md`（锚点 / 相关度 / 引用 / 大纲 / 失败），UI 展示 | 只靠人工 | 可观测、可验收 |
| 一键打回 | Reviewer 打回 Writer 时自动附带 04-review 摘要 | 手动复制 | 闭环顺滑 |

## 实现步骤

### 阶段 A：规划与检索

1. `piConfig`：`roleModel.planner` 默认 `deepseek-v4-pro`（env 可覆盖）；`prompts.planner` 增加“锚定点”小节与“打回时先锚点修订”要求。
2. `keywords.ts`：`maxGroups` 默认提升到 10；组内按 `/` 拆分为中英文两个查询。
3. `SearchConfig` 新增：`SEARCH_MAX_GROUPS`(10)、`SEARCH_COMPENSATE_PER_QUERY`(50)、`SEARCH_MIN_CITATIONS`(0)、`SEARCH_READ_TOP`(8)。
4. 新增 `ArxivClient`、`CrossrefClient`（fetch + 归一化为 SearchPaper），接入 `AcademicSearchService`。
5. `AcademicSearchService.search(planMd, opts?: { compensate?: boolean })`：补偿时提高 per-query、按 minCitations 过滤排序、用全部关键词组；`SearchStats` 增加 `keywordsUsed` / `queries` / `minCitations`。
6. `PiStepRunner` researcher 分支：feedback 非空 → `compensate=true`；检索概览写入所用关键词与参数。
7. `merge.ts`：增加 `relevanceScore`（标题 + 摘要与关键词 token 重叠），弱相关论文垫底并标注，不硬删。

### 阶段 B：证据池与全文

8. `EvidenceStepService`：新增 `buildEvidencePool(artifacts)`，合并全部 research-cards 版本（按卡片 id / DOI 去重，标注来源版本），writer / reviewer / lint 统一基于合并池。
9. data：`papers` 表新增 `full_text TEXT`（migrate）；`.gitignore` 增加 `data/pdfs/`。
10. 新增 `apps/server/src/evidence/fullText.ts`：`resolvePdfUrl`（arXiv / S2 openAccessPdf / OpenAlex best_oa_location）→ 下载到 `data/pdfs/<externalId>.pdf` → 提取文本（pdf-parse，安装依赖）→ 截断存入 `papers.full_text`；失败标注“仅摘要”。
11. `ResearcherStepService`：检索后对 top-N 论文串行获取全文（限流），在 research-cards 中标注“已读全文 / 仅摘要”。
12. `prompts.writer`：注入合并证据池 + top-N 全文（每篇截断约 8000 字符），强制 `[n]` 引用、参考文献与正文一致；未读全文的论文不得展开论点。

### 阶段 C：引用、评估与 UI

13. `lint.ts`：`extractCitationIds` 兼容 `[V1-n]` / `[V2-n]`（归一化为 n 并标记来源前缀）；0 引用但存在引用符号 → “格式异常”提示；参考文献列表完整性检查。
14. 新增 `apps/server/src/evidence/evaluation.ts`：`buildEvaluationReport({ plan, cardsPool, draft, lint, stats })` 生成 `evaluation-report.md`（锚点覆盖、证据相关度 top / bottom、引用有效性、大纲章节覆盖、来源失败）；Reviewer 前置阶段生成并广播。
15. web：`EvidencePanel` 展示指标（命中 / 去重 / 失败、证据池规模、全文已读、lint 摘要、大纲覆盖）；`ApprovalPanel` 在 Reviewer 步骤增加“打回 Writer 并附审查意见”按钮（`decide('modify', note=04-review 摘要)`）。
16. 新增 `scripts/verify-m2-7.mjs`：打回 planner 一次 + 打回 researcher 一次 + 逐步审批；断言证据池合并、全文已读 ≥ 3、lint 引用 > 0、`evaluation-report.md` 存在。

## 测试方案

- keywords：≤10 组、中英文拆分；
- clients：arXiv / Crossref 归一化与失败重试（mock fetch）；
- search service：compensate 参数生效、stats 字段；
- evidence pool：多版本合并去重、来源版本标注；
- fullText：URL 解析、下载失败回退、文本截断（mock）；
- lint：前缀兼容、格式异常提示、参考文献校验；
- evaluation：报告字段齐全（mock artifacts）；
- engine / web：一键打回 reviewer→writer 带意见；EvidencePanel 指标渲染；
- 手动：`node scripts/verify-m2-7.mjs` 真实跑一轮，对比打回前后结果；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：检索源扩展、全文模块、评估报告、规划 v4-pro。
- `docs/architecture/03-data-model.md`：`papers.full_text`、证据池语义。
- `docs/guide/runbook.md`：新环境变量（`SEARCH_*` / `PI_MODEL_PLANNER`）、verify-m2-7。
- `docs/INDEX.md`：登记 M2-7 issue / plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-15
- 审查视角：补偿是否真生效、证据与引用是否一致、全文模块是否拖慢主流程、评估口径是否稳定
- 发现与处理：
  - [major] 打回必须真正改变搜索策略，否则“补偿”是空话 → compensate 参数化并写入 stats，测试覆盖；
  - [major] writer 引用必须基于“合并证据池 + 全文”，避免再次出现 V1 / V2 漂移 → 统一 `buildEvidencePool` 入口；
  - [major] 全文下载可能慢或失败 → 串行 + 限流 + 回退标注，不阻塞主流程；
  - [minor] v4-pro 更贵，仅 planner 使用 → 角色级模型覆盖 + runbook 说明；
  - [minor] 评估指标口径需稳定 → 写入 architecture 文档。

## 涉及 UI

改动集中在右侧证据面板与审批按钮，已提供线框图；实现时保持“可用优先”。
