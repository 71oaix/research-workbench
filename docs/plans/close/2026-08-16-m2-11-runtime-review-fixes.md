---
title: M2-11 真实案例复盘修复（plan）
status: archived
created: 2026-08-16
updated: 2026-08-16
issue: 2026-08-16-m2-11-runtime-review-fixes
areas: [server, data, web]
---

# M2-11 真实案例复盘修复（plan）

## 任务解释

按第一性原理修掉真实案例暴露的一批“可信度”问题：全文必须真的进库、流程不能永久卡死、核验不能用错权威源、报告数字必须口径正确、产物必须让用户看得懂改了什么。

## 第一性原理（总纲）

每个问题追问“为什么会出现”，答案都是某个环节违背了正确性基线：

| 问题 | 第一性追问 | 基线 |
|------|-----------|------|
| P0-1 全文提取失败 | 选用的库在目标运行时加载即崩，等于没做选型验证 | 依赖必须在 ESM 运行时下可加载、可提取、有防回归测试 |
| P1-1 Reviewer 卡死 | 状态机里 running 只有“成功离开”一条路，进程中断后无对账 | 每个状态必须有终态路径：超时或中断 → failed |
| P1-2 arXiv DOI 误报 | 用 Crossref 核验 DataCite 注册的 arXiv DOI，用错了权威源 | 核验源必须匹配论文类型，无法核验要诚实标 Unverifiable |
| P1-3 计数 undefined | 报告把“缺省值”当“存在值”拼接 | 聚合缺省 = 0，报告永不输出 undefined |
| P2-1 评估失真 | 输入口径错位（失败源读错文件）、粒度不齐（子节当章节）、相似度分母爆炸 | 评估报告的每个数字都必须可追溯到原始输入且可解释 |
| P2-2 产物混乱 | UI 没有把“产物流”翻译成用户能理解的结构 | 用户要能回答：这是什么、在哪个阶段、和上一版差在哪 |
| P2-3 弱相关进 top | 排序只看引用数，相关度不是一等公民 | 检索结果先过滤主题无关，再按引用数排序 |
| P3-2 step_not_found | 决策用全局 selectedId，而步骤自带 workflowId，状态耦合 | 单一事实来源：决策绑定步骤，步骤绑定工作流 |

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 全文提取 | 导入 `pdf-parse/lib/pdf-parse.js`（绕过入口调试分支），已实测可用 | 换 pdfjs-dist | 零依赖变更、确定性修复；换库留 M3 |
| 防回归测试 | 内联最小 PDF fixture（测试内生成，不依赖 data/pdfs） | 引用运行时下载的 PDF | 测试不依赖脏数据目录 |
| running 恢复 | server 启动时把 running 步骤重置为 failed，workflow 置 failed 并提示“上次执行被中断” | 静默重跑 pending | 重跑会重复花钱，诚实失败更可控 |
| 调用超时 | `PiRuntimeHandle.send` 加 5 分钟超时，超时抛 EngineError | 无限等待 | 防止单次调用永久挂起 |
| arXiv DOI 核验 | 新增 arXiv lookup，按 id 核验标题/作者；失败才 Unverifiable | 直接标 Unverifiable | 保持覆盖率，核验源匹配论文类型 |
| 相关度指标 | 卡片命中主题词数 / 主题词总数（覆盖率） | 全集 Jaccard | 可解释、有区分度、与主题门禁一致 |
| 大纲覆盖 | 只比较章级：plan 顶层条目 vs 草稿 `##` 标题，归一化含 ** 与编号 | 含子节全比 | 粒度对齐才不虚低 |
| 来源失败 | 从原始 `research-cards.md` 解析 | 证据池 cardsMd | 证据池格式不含失败源行 |
| 版本对比 | 结构 diff（章节标题 + 引用编号变化 + writer 响应）为主，行级 diff 折叠可选 | 只做行级 diff | v1→v2 是整篇重写，行级 diff 全是增删，无信息 |
| 检索过滤 | topN 前剔除“标题与摘要与主题词零交集”的论文，引用数仍为主排序 | 多因子打分 | 最小改动挡住明显无关论文 |
| step_not_found | 前端 decide 改用步骤自带 workflowId；列表同名工作流显示创建时间/短 id | 只修后端 | 单一事实来源，消除状态耦合 |

## 实现步骤

1. **P0-1 全文提取**：`fullText.ts` 的 `extractPdfText` 改为 `import('pdf-parse/lib/pdf-parse.js')`；新增 `fullText` 测试：内联最小 PDF 提取成功、非 PDF 返回空。
2. **P1-1 恢复与超时**：
   - `PiRuntimeHandle.send` 用 `Promise.race` 加 5 分钟超时（超时抛 `EngineError`，说明角色与步骤）；
   - `createAppBundle` 启动时执行“中断恢复”：将 running 步骤置 failed、executing 工作流置 failed，错误信息提示“上次执行被中断”；
   - 单测：超时 → failed；启动对账 → running 清为 failed。
3. **P1-2 arXiv 核验**：`arxiv.ts` 加 `lookup(id)`（`id_list=` 查询）；`citationVerifier` 的 deps 增加 `lookupArxiv`，DOI 前缀 `10.48550/arxiv.` 时走 arXiv 字段比对，查不到才 Unverifiable；`EvidenceStepService` 注入 arXiv client。
4. **P1-3 计数补零**：`citationVerifier.buildReportMd` 的状态计数用 `?? 0`；加“无 Unverifiable 项”的单测。
5. **P2-1 评估口径**：
   - 相关度改为“命中主题词数 / 主题词总数”的平均覆盖率；
   - 大纲覆盖只比章级，`extractSection('综述大纲')` 只取顶层条目，归一化兼容 `1. **引言**`；
   - `buildEvaluationReport` 增加 `rawCardsMd` 输入，失败源从原始 `research-cards.md` 解析；
   - 三处各加单测（含“来源失败 19 个”场景）。
6. **P2-2 产物呈现**：重构 `ArtifactTabs`：
   - `ARTIFACT_META`：每个产物名 → 分组（规划 / 检索证据 / 全文 / 引用核验 / 评估 / 草稿 / 审查）+ 一句话用途说明；
   - 同一产物多版本：选中后展示“对比上一版”，输出结构 diff（章节标题、引用编号、writer 响应说明），行级 diff 折叠；
   - `paper-fulltext.md` 默认折叠为“已读 N 篇”，点击展开；
   - web 测试覆盖分组、说明、结构 diff。
7. **P2-3 检索过滤**：researcher 取 topN 前，用 plan 主题词对论文做“零交集”过滤；`merge.ts` 排序保持引用数主序；加单测（无关论文被剔除）。
8. **P3-2 状态解耦**：`App.tsx` 的 `onDecide` 传 `awaitingStep.workflowId`，`store.decide` 接受显式 workflowId；`WorkflowList` 同名项显示创建时间 + id 短码。
9. **测试 / 文档 / 验证脚本**：见清单。

## UI 线框图

```text
+ 产物区 -------------------------------------------------------+
| 规划  |  检索证据  |  全文  |  引用核验  |  评估  |  草稿  |  审查  |
|       01-plan    research-cards    paper-fulltext(已读 N 篇)      |
|                 02-research       citation-lint                 |
|                                   citation-verification         |
|                                   evaluation-report             |
+---------------------------------------------------------------+
| 草稿 03-draft.md  [v2] [对比上一版]  用途：综述初稿，按证据写作   |
| 结构差异：                                                        |
|   章节：v1「LLM 时代的设计维度…」→ v2「从容量约束到共享机制」      |
|   引用：v1 含 [4][14]；v2 弃用 [4][14]（提及但未论述）           |
|   writer 响应：针对“全靠摘要”四点调整…                            |
| [展开行级 diff]                                                    |
+---------------------------------------------------------------+
```

## 测试方案

- fullText：内联 PDF 提取成功 / 非 PDF 失败 / pdf-parse 加载路径不再抛 ENOENT；
- engine：send 超时 → failed；启动对账把 running 清 failed；
- citationVerifier：arXiv DOI 走 arXiv 核验（verified / unverifiable，不 critical）；计数无 undefined；
- evaluation：相关度覆盖率、章级大纲覆盖、来源失败从原始卡片解析；
- researcher：主题无关论文被过滤；
- web：ArtifactTabs 分组与说明、结构 diff、同名工作流区分；
- 手动：`node scripts/verify-m2-11.mjs`（真实流程：全文已读 ≥1、核验无 undefined、evaluation 数字与原始卡片一致、产物可分组）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：全文提取修复、running 恢复、arXiv 核验、评估口径、产物分组。
- `docs/guide/runbook.md`：verify-m2-11、超时配置。
- `docs/INDEX.md`：登记 M2-11 plan。

## 对抗性审查

> 子 agent 通道不可用（历史教训），由主 agent 以对抗视角逐条打 plan，结论记录如下。

- 日期：2026-08-16
- 审查角度：每个修复会不会引入新问题、是否真的解决根因、测试是否脆弱
- 发现与处理：
  - [major] 行级 diff 对“整篇重写”的 v1→v2 会显示全删全增，用户仍看不懂 → 改为结构 diff 为主（章节 / 引用 / writer 响应），行级 diff 只作折叠备选；
  - [major] pdf-parse 防回归测试不能依赖 `data/pdfs`（脏目录、可能被清）→ 测试内联生成最小 PDF；
  - [major] running 静默重跑会重复花钱且掩盖中断 → 重置为 failed + 明确“上次执行被中断”，由用户决定重跑；
  - [minor] arXiv DOI 直接标 Unverifiable 会降低覆盖率 → 本轮加 arXiv lookup，只有真正查不到才 Unverifiable；
  - [minor] 相关度改覆盖率可能都趋近 1 → 用“命中主题词数 / 主题词总数”，与主题门禁同口径，阈值可解释；
  - [minor] 大纲覆盖必须处理 `1. **引言**` 与 `## 1 引言` 两种写法，且只比章级，否则仍虚低；
  - [minor] 启动对账假设单实例：文档注明不支持多开 dev，否则会误判“还在跑的步骤”；
  - [minor] P2-3 过滤可能误杀相关但措辞不同的论文 → 用“标题或摘要含任一主题词”宽松判定，引用数仍为主排序；
  - [minor] P3-1“提及即引用”语义改造成本高、收益低 → 本轮不做，记录在 issue 留 M3。

## 不涉及 UI 的部分

涉及 UI（产物分组与版本对比），线框图见上；其余为纯后端与数据修复。
