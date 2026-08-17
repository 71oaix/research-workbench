---
title: M2-8 全文获取与证据闭环（下载校验 + 证据池 + 全文写作）（plan）
status: archived
created: 2026-08-16
updated: 2026-08-16
issue: 2026-08-16-m2-8-fulltext-evidence
areas: [server, data, shared]
---

# M2-8 全文获取与证据闭环（plan）

## 任务解释

让论文被“真正下载并读”再写作：对 top-N 论文 OA 优先下载 PDF 并校验、提取全文入库；多版本证据卡片合并为证据池；Writer 基于证据池与全文写作，引用必须落在证据池，产物附带一句话论点与 claim-evidence map。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 全文来源 | arXiv PDF → S2 openAccessPdf → OpenAlex best_oa_location；失败标注“仅摘要” | 机构授权 / Sci-Hub | 合法 OA 优先，规避版权 |
| PDF 校验 | 非空 + `%PDF` 头 + 提取出非空文本 | 只下载不校验 | 避免把登录页 / 空文件当全文 |
| 全文入库 | `papers.full_text`（截断约 20k 字符） | 单独文件表 | 复用现有 papers 仓储与去重，够 Writer 用 |
| 文本提取 | `pdf-parse` 依赖 | 自写解析 | 稳定，成本低 |
| 获取规模 | top-N（默认 8）串行 + 限流 | 全量 / 并发 | 控制时间与请求，失败不阻塞主流程 |
| 证据池 | 解析全部 research-cards 版本，按 DOI/arXiv/标题去重后合并重编号，标注来源版本 | 最新版替换旧版 | 修复真实运行中的版本错位 |
| 写作 | Writer 注入证据池 + top-N 全文；对齐门输出“一句话论点 + 段落图”；产物附 claim-evidence map | 只改提示词 | 从证据向外写，引用可核查 |
| 引用格式 | 继续强制纯数字 `[n]`，编号与证据池重编号一致 | 带版本前缀 | 与 M2-9 lint 对齐 |

## 实现步骤

1. **data**：`papers` 表新增 `full_text TEXT`（migrate）；`Paper` 类型新增 `fullText: string | null`；repositories 读写支持。
2. **全文模块** `apps/server/src/evidence/fullText.ts`：
   - `resolvePdfUrl(paper)`：arXiv id → `arxiv.org/pdf/{id}`；否则 `paper.url` 是 PDF 则用之；否则从 `paper.raw` 解析 S2 `openAccessPdf.url` / OpenAlex `best_oa_location.pdf_url`；
   - `acquireFullText(paper, dir)`：下载到 `data/pdfs/<externalId>.pdf`，校验 `%PDF` 与非空，用 `pdf-parse` 提取文本，截断后返回；失败返回 null；
   - `.gitignore` 增加 `data/pdfs/`。
3. **OpenAlex client**：`select` 增加 `best_oa_location`（保留在 raw 供解析）。
4. **ResearcherStepService**：检索合并后对 top-N 论文串行 `acquireFullText`，回写 `papers.fullText`（upsert 已有 fullText 字段）；把“已读全文 / 仅摘要”集合传给卡片生成。
5. **cards.ts**：`buildResearchCards` 增加 `fullTextIds` 参数，每张卡片标注“已读全文 / 仅摘要”，概览加“全文：已读 N / 仅摘要 M”。
6. **证据池** `apps/server/src/evidence/evidencePool.ts`：`buildEvidencePool(artifacts)` 解析全部 `research-cards.md` 版本，按 DOI/arXiv/标题去重合并、重编号并标注来源版本，返回合并 markdown 与编号集合；`EvidenceStepService` 的 writer / reviewer 分支改用证据池（不再只取最新版）。
7. **prompts.ts**：Writer 增加“先输出一句话论点与段落图（对齐门）”“从证据向外写”“文末附 claim-evidence map”；Reviewer 使用证据池编号。
8. **PiStepRunner / EvidenceStepService**：Writer 输入注入证据池 + top-N 全文（截断）。
9. **测试与文档**：见清单。

## 测试方案

- data：`full_text` 迁移与 upsert 读写；
- fullText：`resolvePdfUrl` 分支、`acquireFullText` 对有效 / 空 / 非 PDF 的 mock（校验与回退）；
- researcher：top-N 获取全文并回写 papers、标注“已读 / 仅摘要”；
- evidencePool：多版本合并去重、重编号、来源版本标注；
- EvidenceStepService：writer / reviewer 使用证据池；
- prompts / runner：Writer 输入含证据池与全文、对齐门与 claim-evidence map 指令；
- 手动：`node scripts/verify-m2-8.mjs`（真实流程，断言全文已读 ≥ 1、证据池合并、草稿含 claim-evidence map）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：全文模块、证据池、写作对齐门。
- `docs/architecture/03-data-model.md`：`papers.full_text`。
- `docs/guide/runbook.md`：`SEARCH_READ_TOP`、pdf-parse 依赖、verify-m2-8。
- `docs/INDEX.md`：登记 M2-8 plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-16
- 审查视角：全文失败不阻塞、证据池与引用编号一致、成本可控
- 发现与处理：
  - [major] 全文下载失败不能阻塞主流程 → 串行 + 回退标注“仅摘要”，单测覆盖；
  - [major] 证据池重编号必须与 Writer 引用一致，否则 M2-9 无法核验 → 证据池作为唯一编号来源，卡片与 lint 共用；
  - [minor] 全文截断 20k 字符，避免 context 溢出 → 固定上限并写入文档；
  - [minor] pdf-parse 为运行时依赖，安装后需锁文件 → 实施时执行 npm install。

## 不涉及 UI

纯后端，不涉及 UI，按 artifacts 硬性要求无需线框图或 HTML 预览。
