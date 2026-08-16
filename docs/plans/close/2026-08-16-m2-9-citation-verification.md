---
title: M2-9 引用核验升级（字段级多源交叉 + 分级报告）（plan）
status: archived
created: 2026-08-16
updated: 2026-08-16
issue: 2026-08-16-m2-9-citation-verification
areas: [server, shared]
---

# M2-9 引用核验升级（plan）

## 任务解释

把引用检查从“编号是否在范围内”升级为“字段级多源交叉核验”：解析草稿引用，用 Crossref 解析 DOI，与证据池元数据逐字段比对，输出分级报告，接入 Reviewer。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 解析 | `[n]` + 兼容 `[V1-n]` 归一化 | 只认纯数字 | 修真实运行的格式漂移 |
| 主源 | Crossref DOI lookup（T1），失败回退标题+第一作者检索 | S2/PubMed 全接 | MVP 用最稳的 DOI 源，多源留 M3 |
| 字段比对 | 标题核心词、年份、第一作者 | 页码/卷期 | 先做高信号字段，页码深度留 M3 |
| 分级 | Critical / Warning / Info + Verified / Check suggested / Needs fix / Unverifiable | 自由文本 | 可追踪、可复核 |
| 输出 | `citation-verification.md` artifact，注入 reviewer | 只打印 | 可观测、可回看 |

## 实现步骤

1. `citations/lint.ts`：`extractCitationIds` 兼容 `[V1-n]` / `[V2-n]`（归一化为 n），`buildCitationLint` 标记格式异常。
2. `CrossrefClient.lookup(doi)`：`/works/{doi}` 返回规范化 SearchPaper 或 null。
3. `evidencePool.ts`：`buildEvidencePool` 额外返回结构化 `cards`（DOI/arXiv/标题/作者/年份）供核验使用。
4. 新增 `evidence/citationVerifier.ts`：解析草稿引用 → 逐条 Crossref 解析 → 与证据池元数据比对 → 分级与置信度 → 报告。
5. `EvidenceStepService.prepareReviewer`：生成 `citation-verification.md` 并注入 prompt。
6. 测试与文档（见清单）。

## 测试方案

- lint：`[V1-n]` 归一化、格式异常提示；
- verifier：DOI 张冠李戴、标题核心词不一致、年份/作者不一致、DOI 404 回退、未解析；
- evidencePool：结构化 cards 字段；
- runner：reviewer 前置生成 citation-verification.md 并注入；
- 手动：`node scripts/verify-m2-9.mjs`；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：引用核验模块。
- `docs/guide/runbook.md`：verify-m2-9。
- `docs/INDEX.md`：登记 M2-9 plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-16
- 审查视角：核验结果可追踪、失败回退、分级稳定
- 发现与处理：
  - [major] 核验必须以证据池编号为锚，保证与 Writer 引用一致 → verifier 输入为证据池 cards；
  - [minor] Crossref 无匹配时回退标题+作者，标 Unverifiable → 已写入步骤 4；
  - [minor] `[V1-n]` 归一化要保留“曾出现带前缀编号”的格式异常提示 → 已写入步骤 1。

## 不涉及 UI

纯后端，不涉及 UI，按 artifacts 硬性要求无需线框图或 HTML 预览。
