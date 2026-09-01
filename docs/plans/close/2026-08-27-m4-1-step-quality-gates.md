---
title: M4-1 覆盖驱动质量门 + 自动迭代回环（plan）
status: archived
created: 2026-08-27
updated: 2026-08-31
issue: "docs/issues/close/2026-08-27-m4-1-step-quality-gates.md"
areas: [server]
---

# M4-1 覆盖驱动质量门 + 自动迭代回环（plan）

## 任务摘要
在检索/筛选阶段加"覆盖质量门"：检查计划的子问题/章节是否被证据池支撑，未覆盖自动触发 gap 二次检索并重筛，形成"检索↔覆盖"自动迭代回环（达上限停止）。

## 为什么做
8/25 例子"研究下多智能体的记忆架构"：计划 5 个子问题，证据池只有 Mem0 类，AutoGen/CrewAI/MetaGPT 记忆机制、评测基准等**无论文支撑**。根因是检索召回不足且无覆盖检查，缺了不补。

## 预计效果
- 子问题/章节覆盖矩阵可读（→ 论文 → 覆盖/部分/缺失）；
- 未覆盖子问题自动补检索（gap 查询）+ 重筛，覆盖度明显提升；
- 达到上限时如实标注"仍未覆盖"，不静默。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 质量门位置 | selector 之后（覆盖检查） | 每角色独立引擎回环 | 覆盖不足是 8/25 主痛点；先做检索↔覆盖闭环，风险低 |
| 迭代方式 | 覆盖不足→gap 查询→二次检索→重筛，≤3 轮 | 无限回环 | 收敛 + 控成本 |
| 矩阵 | `coverage-matrix.md`（子问题→论文→判定→建议） | 仅提示 | 用户可用、可测 |

## Review 发现与修正
- [major] 提取子问题与卡片的"覆盖"判定易误判 → 修正：按子问题分词与卡片标题/摘要词元交叠 + 引用锚点，给覆盖/部分/缺失三档。
- [major] gap 二次检索可能再次召回无关 → 修正：gap 查询用"子问题原文 + 核心概念"，并进入重筛统一判定。
- [minor] 覆盖矩阵太长 → 修正：只列未覆盖/部分覆盖子问题的 gap 建议，覆盖良好的折叠显示。

## 实现步骤
1. `buildCoverageMatrix(planContent, papers)`：解析子问题/锚点 → 与卡片做覆盖判定 → md 矩阵。
2. selector 后：若存在"缺失"子问题且轮次<3，自动生成 gap 查询二次检索 + 重筛，合并新论文再判，循环。
3. 产出 `coverage-matrix.md`，在文件 tab / 对话流可读。

## 测试与验证
- 单测：覆盖判定三档；缺失触发 gap 查询；≤3 轮。
- 复现：8/25 例子真实跑，覆盖度前后对比。

## 验收标准
- [ ] 覆盖矩阵可读（子问题→论文→覆盖/部分/缺失→建议）
- [ ] 缺失子问题自动 gap 二次检索 + 重筛
- [ ] ≤3 轮上限，达到标注"仍未覆盖"
- [ ] typecheck / test 全绿

## v2 追加：模型辅助覆盖判定（2026-08-28）

### 任务摘要
在规则判定之上加"模型复核"：规则先跑（快、免费、可测），非 covered 行批量交模型精判，判定升级后 gap 回环按升级结果走。规则结果始终保留为失败兜底。

### 为什么做
v1 真实运行暴露：纯词元交叠误判明显——中文子问题与英文论文即使有双语搭桥，仍把"记忆评测基准"等子问题误判为 covered（表面词元撞上）或 missing（语义相关但词元不交）。用户 8/25 反馈"好几个问题都不能被支撑"，其中一部分是**判不准**而不是真缺失。

### 预计效果
- 覆盖矩阵三档判定准确率显著提升（抽查 8/25 例子，误判行从 2+ 降到 ≤1）；
- 每轮 gap 回环新增 ≤1 次批量判定调用（≤3 轮 → 全流程最多 3 次，约 ¥0.01-0.03）；
- 判定调用失败/超时/解析失败时静默回退规则结果，流程不断。

### 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 判定时机 | commit 内每轮 buildCoverageMatrix 后 | 并入 selector stage 输出 | commit 在 gap 回环内需反复重判；stage 改动面大且解析已有回退问题 |
| 注入方式 | SelectorStepServiceImpl 第 5 个可选依赖 `CoverageJudge` | service 内直接建 runtime | 保持 search 层无 runtime 依赖；测试注入 fake 即可；缺省 undefined=纯规则（旧测试零破坏） |
| 规则与模型关系 | 非 covered 行才送审，模型结论优先、id 校验防幻觉 | 每行全量送审 / 模型为兜底 | 控成本控延迟；规则已 covered 的无需复核；id 不在候选范围则丢弃该行 |
| 判定输出 | 仅 JSON 数组（id/coverage/papers） | Markdown 表格 | JSON 解析确定性最高 |

### Review 发现与修正
- [major] 模型可能引用不存在的论文编号（幻觉）→ 修正：合并前校验 id ∈ 候选序号集合，越界丢弃。
- [major] 判定调用挂死会阻塞工作流 → 修正：PiRuntimeHandle 已有超时机制，judge 外再包 try/catch，任何异常回退规则矩阵（与现有 gap loop catch 语义一致）。
- [minor] 中文子问题 vs 英文论文的对应关系仍难 → 修正：prompt 中附带双语检索关键词锚点对，帮模型搭桥。
- [minor] 论文多时 prompt 过长 → 修正：摘要截断至 600 字符/篇，仅送入选论文（通常 ≤25 篇）。

### 真实验证后的决策修正（2026-08-28）
- **[major→修正原"仅非 covered 行送审"]改为全量行送审**：真实运行证明规则判定对综述型主题天然全绿（中文 bigram + 双语锚点使词元交叠几乎必 ≥2），规则假阳性不会自行暴露——若只送非 covered 行，复核永远不触发。现在所有子问题行一次批量送审，模型可降级误判行（covered→partial/missing）从而真正驱动 gap 补检索；judge 失败时回退规则结果。矩阵中被模型改动结论的行标注"（模型复核）"。

### 实现步骤
1. `src/search/coverageJudge.ts`：定义 `CoverageJudge` 类型 + `parseJudgeOutput`（JSON 提取、值域校验、id 过滤、与规则行合并函数 `refineCoverage`）。
2. `src/runtime/PiCoverageJudge.ts`：用 PiRuntimeProvider 建一次性 selector 会话，组装批量判定 prompt，90s 超时，异常返回 null。
3. `SelectorStepService.commit`：build 后调用 refine（含 gap 循环内重判）；构造函数加可选 judge 参数。
4. `index.ts` 装配：new PiCoverageJudge(provider) 传入 selector。
5. 测试：coverageJudge.test.ts（解析/过滤/合并）+ selectorStep.test.ts 追加 fake judge 升级行与失败回退两用例。

### 测试与验证
- 单测：见实现步骤 5。
- 真实："研究下多智能体的记忆架构"完整跑一轮，对比 v1/v2 覆盖矩阵行判定差异。

### 验收标准
- [ ] 非 covered 行经模型复核后误判减少（矩阵内展示"判定依据=模型/规则"）
- [ ] judge 失败静默回退，typecheck/test 全绿
- [ ] 全流程模型判定调用 ≤3 次

## 文档更新清单
- `docs/guide/runbook.md`：coverage-matrix 说明 + 模型复核行为。

## 涉及 UI/预览
覆盖矩阵作为产物在对话流/文件 tab（MarkdownView 表格渲染）。
