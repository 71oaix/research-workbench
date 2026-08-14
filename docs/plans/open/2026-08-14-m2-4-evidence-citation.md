---
title: M2-4 Writer / Reviewer 证据引用（基于检索卡片写稿与核查）（plan）
status: active
created: 2026-08-14
updated: 2026-08-14
issue: 2026-08-14-m2-4-evidence-citation
areas: [server, shared]
---

# M2-4 Writer / Reviewer 证据引用（plan）

## 任务解释

把 Writer / Reviewer 从占位提示词升级为真实写作与核查环节：writer 基于 `research-cards.md` 撰写带 [编号] 引用的 `03-draft.md`；代码自动提取并检查草稿引用，产出 `citation-lint.md`；reviewer 基于草稿 + 卡片 + lint 报告输出 `04-review.md`。让人只看结论与中间产物即可验收，实现“可核查引用”的作品叙事。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 事实来源 | writer / reviewer 只读 `research-cards.md`（确定性证据），不直接读 papers 表 | 让模型自己查库 / 联网 | 证据链单一、可审计；papers 表是留痕，不是写作上下文 |
| 引用格式 | 正文 `[n]` 编号，文末参考文献列表映射编号 → 标题 / 年份 / DOI / 链接 | 作者-年份制（APA） | 与卡片编号直接对应，便于确定性检查；导出格式留 M3 |
| 引用检查 | 确定性代码提取 `[n]` 并校验是否在卡片编号集合内，生成 `citation-lint.md` | 让 reviewer 模型自己数 | 可复现、可审计；模型只做质量判断，不做计数 |
| 检查失败语义 | 越界 / 缺失引用不阻断流程，写入 lint 报告由 reviewer 与人判断；草稿完全无 `[n]` 时在报告中提示 | 直接置 workflow failed | 引用缺失可能是写作风格问题，交给审批决策 |
| 编号集合 | 以 `research-cards.md` 中 `### [n]` 的实际编号为准 | 假设 1..N | 防编号错位，与 M2-3 卡片输出一致 |
| 分支实现 | 复用 PiStepRunner 前置准备模式：writer 注入卡片，reviewer 注入草稿 + 卡片 + lint；lint artifact 由代码创建 | 新开独立 runner | 保持运行时统一，改动最小 |
| 事件 | 复用 `artifact.updated` 广播 lint 产物 | 新增 citation.linted 事件 | 中间产物已可观测，避免事件类型膨胀 |
| Prompt 成本 | 卡片全文注入（默认 15 张、摘要截断 300 字） | 进一步裁剪摘要 | 足够模型准确引用，成本可控（deepseek-v4-flash） |

## 实现步骤

1. `apps/server/src/citations/lint.ts`：`extractCitationIds(md)`（匹配 `[n]`，去重并统计出现次数）、`buildCitationLint(draft, cardIds)` 生成 markdown 报告（引用总数、有效编号、越界 / 缺失编号、出现次数 Top）。
2. `apps/server/src/search/cards.ts`：新增 `extractCardIds(cardsMd)`（解析 `### [n]` 标题行）。
3. `apps/server/src/evidence/EvidenceStepService.ts`：接口 `prepareWriter` / `prepareReviewer`；实现类注入 `repos + bus`；writer 返回卡片 prompt 附加段；reviewer 运行 lint、创建 `citation-lint.md` artifact（广播 `artifact.updated`）、返回草稿 + 卡片 + lint 附加段。
4. `prompts.ts`：更新 writer 提示词（章节结构、`[n]` 引用、文末参考文献列表）；更新 reviewer 提示词（可信引用清单、存疑引用与原因、覆盖不足方向、总体结论）。
5. `PiStepRunner.ts`：新增可选 `evidence` 依赖；writer 分支找 `research-cards.md` 并注入；reviewer 分支找 `03-draft.md` + `research-cards.md` 并注入；缺失关键 artifact 时报错置 failed。
6. `index.ts`：装配 `EvidenceStepService`。
7. 测试：lint 单测、writer / reviewer 分支测试（内存库 + mock provider）。
8. `scripts/verify-m2-4.mjs`：在 M2-3 验证基础上增加：`03-draft.md` 引用数 ≥ 5 且编号全部在卡片内、`citation-lint.md` 存在、`04-review.md` 含三部分。
9. 文档更新（见清单）。

## 测试方案

- **单测**：
  - `extractCitationIds`：普通编号、越界编号、重复引用统计、无引用；
  - `buildCitationLint`：报告包含总数 / 有效集合 / 无效清单；空卡片集合；
  - writer 分支：输入含卡片 → `handle.send` 收到含卡片文本的 prompt，产物名 `03-draft.md`；
  - reviewer 分支：输入含草稿 + 卡片 → 生成 `citation-lint.md` artifact 并广播，prompt 包含 lint，产物名 `04-review.md`；
  - 缺失卡片 / 草稿 → 报错。
- **手动验证**：`node scripts/verify-m2-4.mjs`（服务带 key）；检查草稿引用与 lint 一致、reviewer 报告完整。
- **CI**：typecheck + test 全绿；真实模型调用不进 CI。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：新增“证据引用（M2-4）”小节。
- `docs/guide/runbook.md`：verify-m2-4 说明。
- `docs/INDEX.md`：归档 M2-3 issue / plan，登记 M2-4 issue / plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-14
- 审查视角：引用可核查性、失败路径、prompt 成本、与 M2-3 衔接
- 发现与处理：
  - [major] 引用编号必须按卡片实际编号集合校验，不假设 1..N → 已写入决策表与步骤 2；
  - [major] lint 发现越界引用不应让整个流程失败，否则“发现问题”本身无法展示 → 写入 lint 报告由 reviewer / 人决策；
  - [minor] writer 与 reviewer 都注入卡片全文，需控制卡片数量 → 沿用 SEARCH_TOP_N（默认 15）并在文档注明；
  - [minor] reviewer 需要 lint 报告先于模型调用生成 → 前置准备阶段在 handle.send 之前完成并落 artifact；
  - [minor] 草稿完全无引用时 lint 仍应输出可读报告 → “无引用”作为明确信号写入报告。

## 不涉及 UI

纯后端，无 UI，按 artifacts 硬性要求无需线框图或 HTML 预览。
