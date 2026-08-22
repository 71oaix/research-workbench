---
title: M2-10 审查与评估（concern ledger + evaluation-report + UI）（plan）
status: archived
created: 2026-08-16
updated: 2026-08-16
issue: 2026-08-16-m2-10-review-evaluation
areas: [server, shared, web]
---

# M2-10 审查与评估（plan）

## 任务解释

把 reviewer 的自由文本意见升级为可机器解析的 concern ledger（五要素），并新增确定性的 evaluation-report（主题匹配门禁 / 相关度 / 大纲覆盖 / 来源失败），让“能不能过、依据是什么、怎么才算解决”从人工判断变成可追踪指标，UI 同步展示并支持一键打回 Writer。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| concern ledger 载体 | reviewer 在 `04-review.md` 内输出固定格式 `Concern Ledger` 小节，程序解析 | 独立 JSON 产物 / 后端后处理钩子 | 不引入引擎改动，保持 Markdown 可读，解析可复现 |
| ledger 结构 | 内化 nature-reviewer：ID + severity(major/minor) + blocking + claim + evidence + resolution（五要素） | 12-axis 全量 taxonomy / 多审查者隔离 | 单 reviewer 覆盖验收标准，axis 与多审查者留 M3 |
| 解析位置 | `@research-workbench/shared` 新增 `review.ts`（类型 + parse + summarize） | 前端各写一份 / 仅后端 | 前后端复用同一解析与计数，可单测 |
| evaluation-report | 确定性词元匹配（零模型成本），在 `prepareReviewer` 产出 | 模型评分 / 六维完整评分 | 可复现、可追踪，六维留 M3 |
| 主题匹配 / 相关度 | 中英混合 tokenizer（英文词 + 中文 bigram）+ 命中率与 Jaccard；主题词取自 plan 锚定点与检索关键词 | 只做英文 | 覆盖中英文查询，复用 merge 归一化思想 |
| 门禁阈值 | 主题命中率 < 0.4 判“未通过”（默认，可配置） | 硬编码 0 / 不做门禁 | 可控，后续按真实分布校准 |
| 大纲覆盖 | plan“综述大纲”标题 vs 草稿 `##` 标题归一化匹配 | 模型判断 | 确定性、零成本 |
| 来源失败 | 从 `research-cards.md` 解析“失败源”行 | 新增 stats 持久化 | 复用已有产物，不扩 schema |
| 打回 Writer | 复用现有 reviewer→writer 的 modify 语义；ApprovalPanel 在 reviewer 步骤预填 blocking concerns | 新增独立引擎动作 | 引擎已支持，只补 UI 一键填充 |

## 实现步骤

1. **shared**：新增 `packages/shared/src/review.ts`：
   - `Concern` 类型：`{ id, severity: 'major' | 'minor', blocking: boolean, claim, evidence, resolution }`；
   - `parseConcernLedger(md)`：解析 `### C1` 块 + `severity / blocking / claim / evidence / resolution` 字段；
   - `summarizeConcerns(concerns)`：返回 `{ blocking, major, minor }` 计数；`index.ts` 导出。
2. **server specs**：新增 `apps/server/src/specs/fragments/review.md`（concern ledger 输出规范，内化 nature-reviewer 的 concern 构造与 severity/blocking 校准）；`specs/index.ts` 加 `buildReviewSpecPrompt()`。
3. **server prompts**：`runtime/prompts.ts` 的 reviewer 系统提示词增加“Concern Ledger 五要素 + 无证据写 Not assessable + 不凑数量”的要求。
4. **server runner**：`PiStepRunner` reviewer 分支注入 `buildReviewSpecPrompt()`。
5. **server evaluation**：新增 `apps/server/src/evidence/evaluation.ts`：
   - `extractThemeTokens(planMd)`：从“锚定点 / 检索关键词”提取中英主题词集合；
   - `tokenize(text)`：英文/数字按词、中文按 bigram、去停用词；
   - `buildEvaluationReport({ planMd, draftMd, cardsMd, cards })`：主题命中率与门禁、平均相关度、大纲覆盖、来源失败，返回 `{ md, summary }`。
6. **server EvidenceStepService**：`prepareReviewer` 额外生成 `evaluation-report.md` artifact（广播），并把报告注入 reviewer prompt。
7. **web EvidencePanel**：新增“评估”区展示 evaluation 指标（门禁/相关度/覆盖/失败源）与 concern ledger 计数（blocking/major/minor），复用 shared parser。
8. **web ApprovalPanel**：reviewer 步骤时，解析 blocking concerns，提供“打回 Writer”一键把 blocking 摘要预填进意见框。
9. **测试 / 文档 / 验证脚本**：见清单。

## UI 线框图

右侧证据面板（EvidencePanel）在“引用检查”下方新增两块：

```text
+ 证据 / 引用 ---------------------------------+
| 检索概览                                    |
|   命中 / 去重 ...  失败源 ...               |
| 引用检查                                    |
|   有效引用编号 ...  越界 / 缺失编号 ...     |
| 评估报告                                    |
|   主题匹配：通过 / 未通过（命中率 x%）      |
|   平均相关度：0.xx   大纲覆盖：n/m          |
|   来源失败：无 / S2, OpenAlex               |
| 审查意见（Concern Ledger）                  |
|   Blocking n  Major n  Minor n              |
|   [C1 blocking] 摘要...（可展开）           |
+---------------------------------------------+
```

审批面板（ApprovalPanel）在 reviewer 步骤时，“打回修改”按钮旁增加“打回 Writer”：

```text
+ 审批：审查引用 ---------------------------------+
| [意见框：可被 blocking 摘要自动预填]           |
| [通过] [打回 Writer] [取消任务]                |
+------------------------------------------------+
```

> 说明：“打回 Writer”复用现有 `modify` 决策（reviewer→writer 自动重跑），仅做预填意见与文案区分，不新增引擎动作。

## 测试方案

- shared：`review.ts` 的 `parseConcernLedger`（合法 / 缺字段 / 空 ledger）与 `summarizeConcerns` 计数；
- server evaluation：`tokenize` 中英混合、`extractThemeTokens`、主题门禁通过/未通过、大纲覆盖、来源失败解析；
- server EvidenceStepService：reviewer 阶段生成 `evaluation-report.md` 并注入；
- server PiStepRunner：reviewer 注入 review spec；
- web：EvidencePanel 展示指标、ApprovalPanel 预填 blocking 意见；
- 手动：`node scripts/verify-m2-10.mjs`（真实流程，断言 04-review.md 含 Concern Ledger、evaluation-report.md 含四指标）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：concern ledger、evaluation-report。
- `docs/guide/runbook.md`：verify-m2-10、门禁阈值配置项。
- `docs/INDEX.md`：登记 M2-10 plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-16
- 审查视角：可解析性、门禁阈值可控、不阻断主流程、中英 tokenizer 不误伤
- 发现与处理：
  - [major] concern ledger 必须让程序可靠解析，否则 UI 无法计数 → 固定 `### C1` + 英文字段 key，缺字段按 `not assessable` 处理，单测覆盖；
  - [major] evaluation 不能阻断 reviewer 流程 → 与 citation-lint 一致，只产出报告注入，不做硬失败；
  - [minor] 主题匹配门禁阈值硬编码会误伤中文短标题 → 默认 0.4 且可配置，真实分布后校准；
  - [minor] 中文标题需分词，否则相关度全为 0 → 用中文 bigram tokenizer，不依赖外部分词器。
