---
title: M2-16 全量吸收：结果归纳整理 + 评测闭环 + 成本落地 + writer 可选项（plan）
status: active
created: 2026-08-20
updated: 2026-08-20
issue: 2026-08-20-m2-16-full-absorption
areas: [server, web, scripts, docs]
---

# M2-16 全量吸收：结果归纳整理 + 评测闭环 + 成本落地 + writer 可选项（plan）

## 任务摘要

把华为赛题吸收补到全量：新增 summarizer 归纳整理（主题分组 + 相关度分级标签 + 引用清单导出），
跑通评测闭环（LitSearch 子集 + 自建查询，含“无迭代版”基线对比）并把成本/效果指标写进项目文档；
同时让 writer 变为可选项，提供无 writer 的调研模板，仍能产出可交付的调研结果。

## 为什么做（原因）

M2-15 真实运行已验证第一波吸收（命中 3041、候选池 38、入选 21 且分级带理由、无无关论文），
但对照华为赛题评分与吸收方案 `docs/research/2026-08-20-huawei-topic-absorption.md`，仍有四块差距：

1. 结果结构化（华为 10% 分）：最终产物只有卡片 + 草稿，缺主题分组 / 分级标签 / 引用清单导出；
2. 评测闭环（华为 20% 效率分 + 答辩“效果怎么证明”）：eval/cost 脚本已就绪但没全量跑通，
   没有基线与全量版对比，无法量化吸收收益；
3. 成本落地：usage_records 聚合脚本已就绪，指标表未进文档；
4. 用户明确需求：writer 变可选项（先把筛选与排序做好），需要无 writer 的调研流程仍可交付。

## 预计效果

- 最终产物结构化：`05-summary.md`（主题分组 + 分级标签 + 引用清单）+ `references.bib`，
  华为 10% 结构化分落地；
- 评测闭环：全量 30-50 条查询（LitSearch 子集 + 自建）跑通，输出
  recall@20（全量 vs 基线）/ precision / 核验率 / 每查询成本与延时指标表，
  预期基线 < 全量（子问题 + 时间过滤 + 雪球 + 分级的收益可量化）；
- 无 writer 调研模板完整跑通，reviewer/evaluator 在无草稿下降级不报错，
  产物仍含证据池审查与归纳结果；
- 成本指标表写入 `docs/research/`，可由 `scripts/cost-report.mjs` 复现；
- 时间：M2-16 预计 2-2.5 轮（8/21-8/23），不挤占 8/25 材料初稿节点。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| summarizer 实现 | 确定性实现（主题词聚类 + 规则分组 + 模板生成），不调用模型 | 模型生成总结 | 便宜稳定可复现；模型润色留 M3 |
| summarizer 位置 | 放 reviewer 之后的收尾步骤（requiresApproval=false），产出 05-summary.md + references.bib | 并入 selector / writer | 它是最终交付物，不干扰中间审查；可独立回看 |
| 卡片分组 | 可进多组（主组 + 相关组），未命中进“其他” | 每卡唯一分组 | 多主题论文常见，硬分组失真 |
| BibTeX | 只输出必填字段（title/author/year/doi/url），缺失字段省略 | 编造 volume/page 等 | 不引入假元数据 |
| 评测基线 | “无迭代版”= 只有关键词组（无子问题合并/时间过滤/雪球/分级排序）；同义词扩展属生产行为保留并记录口径 | 完全关闭同义词扩展 | 扩展无法由 planMd 开关控制，基线口径写进报告 |
| 无 writer 降级 | evaluator 改为“证据池覆盖”判定；reviewer 无草稿时跳过 lint/引用审查，输出“证据调研审查” | 强制保留 writer | 满足用户可选项需求，职责清晰 |
| 模板选择 | 前端新建工作流时勾选“包含综述写作”（默认开）；两套步骤列表 | 服务端模板管理 | 引擎已按前端传入步骤运行，零服务端状态机改动 |
| LitSearch 数据 | fetch 脚本下载子集；失败时用自建数据跑通并标注 | 阻塞等网络 | 离线可演示，README 说明来源 |

## Review 发现与修正

> 已完成独立对抗性审查，逐条记录如下：

- [major] summarizer 若走模型角色会加成本与不稳定 → 修正：确定性实现；
  主题分组结果可人工复核（summary 落 artifact）。
- [major] 无 writer 时 evaluator 的“大纲覆盖”与 reviewer 的“引用审查”都依赖草稿 →
  修正：evaluator 降级为“证据池覆盖”（按 plan 章节 vs 卡片分组/分级比对）；
  reviewer 无草稿时不执行 lint/引用审查，输出“证据调研审查”（覆盖度 + 分级合理性 + 缺口）。
- [major] LitSearch 子集下载依赖网络与仓库格式 → 修正：fetch 脚本容错
  （失败时用自建数据跑通并标注）；gold 缺失时只输出命中统计，不计算 recall。
- [minor] 基线对比口径不透明 → 修正：基线=无子问题/时间过滤/雪球/分级排序，
  同义词扩展保留，口径写入报告。
- [minor] BibTeX 缺字段编造风险 → 修正：只输出必填字段，缺失省略。
- [minor] 主题分组规则可能硬分多主题论文 → 修正：允许多组 + “其他”兜底。
- 未发现其他遗留风险。

## 实现步骤

1. **summarizer 归纳整理（server + shared + web）**
   - `shared/types.ts`：`Role` 加 `'summarizer'`；
   - `prompts.ts`：`ARTIFACT_NAMES['summarizer'] = '05-summary.md'`；
   - 新增 `apps/server/src/evidence/summarizer.ts`：
     - `buildTopicGroups(cardsMd, planMd)`：从 plan 锚定点/子问题提取概念词，
       按主题词命中把卡片分组（主组 + 相关组，未命中进“其他”），标注分级标签；
     - `buildReferencesMd(cards)` / `buildBibtex(cards)`：引用清单导出；
     - `buildSummary(...)`：汇总（检索概览 + 主题分组 + 分级标签 + 引用清单）；
   - 新增 `SummarizerStepService`（或并入 EvidenceStepService）：
     `prepare` 读 `research-cards.md` + `01-plan.md` → 生成 `05-summary.md` + `references.bib` 落库广播；
   - `PiStepRunner`：summarizer 分支（确定性执行，不调用模型）；`MockStepRunner`：summarizer case；
   - `index.ts`：ROLES 加 `'summarizer'`，注入 service；
   - web：`ArtifactTabs` 增加“调研结果”分组（05-summary.md / references.bib）。
2. **writer 可选项（web + server）**
   - `api.ts`：`createWorkflow(goal, { includeWriter: boolean })`；
     完整模板：规划 → 检索 → 筛选 → 写作 → 评估 → 审查 → 归纳（七步）；
     调研模板：规划 → 检索 → 筛选 → 评估 → 审查 → 归纳（六步，无 writer）；
   - `WorkflowList.tsx`：新建时提供“包含综述写作”勾选；
   - `EvidenceStepService.prepareReviewer`：放宽“必须存在 03-draft.md”的限制——
     无草稿时 lint 用空报告 + 提示“无草稿，跳过引用格式检查”，verification 跳过，
     reviewer prompt 注入“无草稿”说明并要求输出“证据调研审查”；
   - `prepareEvaluator`：无草稿时“大纲覆盖”改为“证据池覆盖”口径。
3. **评测闭环（scripts + data + docs）**
   - `scripts/fetch-litsearch.mjs`：下载 LitSearch 查询子集（30 条）→
     `data/eval/litsearch-queries.jsonl`（失败容错，README 注明离线口径）；
   - `scripts/eval-m2-15.mjs` 扩展：
     - `--baseline`：基线 planMd（仅关键词组）跑同一查询集，输出对比表；
     - `--litsearch <file>`：加载 LitSearch 查询（有 relevant 则算 recall，无则命中统计）；
     - 汇总平均 recall@20（全量 vs 基线）、平均耗时/查询数、失败源统计；
   - 运行后生成 `data/eval/report-*.md`，结果摘要写入
     `docs/research/2026-08-21-effect-baseline.md`（指标表 + 基线对比 + 口径说明）。
4. **成本落地（docs）**
   - 运行 `scripts/cost-report.mjs`，把调用次数 / token / ¥ / 耗时指标表
     写入 `docs/research/2026-08-21-effect-baseline.md`（或独立 cost 表）。
5. **测试 / 文档 / 验证脚本**：见下。

## 测试与验证方案

- 单元测试：
  - summarizer：主题分组（多组 + 其他）、分级标签、references.md / bib 字段缺失省略；
  - reviewer：无草稿不抛错，输出含“无草稿”说明；evaluator 无草稿用证据池覆盖口径；
  - web：模板勾选影响 DEFAULT_STEPS（七步 / 六步）；ArtifactTabs 含调研结果分组；
  - eval：基线 planMd 生成（无子问题/时间范围）；litsearch 无 gold 时命中统计不报错。
- 真实运行：
  - `node scripts/verify-m2-15.mjs`（完整七步含 summarizer，最终产物含 05-summary.md 与 references.bib）；
  - 手动五步调研模板跑通，reviewer 输出证据调研审查；
  - `npx tsx scripts/eval-m2-15.mjs --limit 5` 与 `--baseline` 冒烟；
  - `npx tsx scripts/cost-report.mjs` 输出指标表。
- CI：typecheck + test 全绿。

## 验收标准

- [ ] 完整流程最终产物含 `05-summary.md`（主题分组 + 分级标签 + 引用清单）与 `references.bib`
- [ ] 五步调研模板（无 writer）完整跑通，产物含 summary；reviewer 输出证据调研审查不报错
- [ ] eval-m2-15 输出全量 vs 基线 recall@20 对比表 + 每查询成本与延时
- [ ] 成本指标表写入 `docs/research/`，可由 cost-report 复现
- [ ] ArtifactTabs 显示“调研结果”分组
- [ ] typecheck / test 全绿

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：summarizer 角色、调研模板、
  无 writer 降级口径、评测基线定义；
- `docs/guide/runbook.md`：模板勾选、eval `--baseline` / `--litsearch`、fetch-litsearch、verify-m2-16；
- `docs/research/2026-08-21-effect-baseline.md`：评测指标表 + 成本表 + 基线对比；
- `docs/INDEX.md`：登记 M2-16 issue / plan。

## 涉及 UI / 预览

两处 UI 改动（线框图）：

```text
新建工作流：
☑ 包含综述写作（Writer）         → 规划→检索→筛选→写作→评估→审查→归纳（7 步）
☐ 不包含（调研模式）             → 规划→检索→筛选→评估→审查→归纳（6 步）

ArtifactTabs 新增“调研结果”分组：
[05-summary.md] [references.bib]
```

本地预览：`npm run dev` → http://localhost:5173。
