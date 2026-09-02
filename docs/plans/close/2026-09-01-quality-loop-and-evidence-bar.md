---
title: 证据可得性门槛 + 评估迭代闭环 + 官方文档补位（plan）
status: archived
created: 2026-09-01
updated: 2026-09-03
issue: "docs/issues/open/2026-09-01-quality-loop-and-evidence-bar.md"
areas: [server, web]
---

# 证据门槛 + 评估闭环 + 文档补位（plan）

## 任务摘要

把热身二暴露的"会体检不会治病"补成"体检后自动处置"：证据池加可得性门槛（A）、评估低分自动带反馈重写一轮（B）、工程实践类缺口给官方文档补位（C）。总计约 4-5 小时实现 + 30 分钟真实验证，今晚完成，明天录屏。

## 为什么做

窄题实测：12 张证据卡里 2 张无摘要、8 张无全文，evaluator 据此打完整性 2 分并逐条批评——但流程照样"完成"。评委视角这就是"AI 综述不可信"的现成反例：系统自己都说了证据不行，为什么还交付？修完后同一题的叙事变成："系统发现证据不足 → 自动重写 → 如实标注收敛情况"——透明且负责，正好是"可验证"支柱的落地。

## 关键决策

| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 无摘要卡处置 | 不入证据池，候选池/报告注明"仅题录" | 保留并降级标注 | 评估模型建议二选一，"移出"更干净：引用核验与相关度定级都依赖摘要，空卡只会产生"Not assessable"噪音；窄题候选少，但 9 张可核验好于 12 张掺水 |
| 下载重试 | 失败后 1 次补偿重试（复用 Unpaywall 候选链路，单次超时沿用现有 timeoutMs） | 多轮重试/换源矩阵 | 演示时间预算内 1 次够了；上限防卡流程 |
| 评估触发条件 | 综合分 < 3.5 或 完整性 < 3（读 evaluation-scores.md 的规则口径表） | 模型评估文本解析 | 规则口径是结构化表格、解析稳定；模型口径是自然语言 |
| 重写反馈内容 | 从评估报告提取批评要点（章节缺失 + 低分维度理由）拼成 feedback，走现有 pendingFeedback 打回通道 | 原样贴整份报告 | feedback 过长会稀释 writer 注意力；要点化（≤400 字） |
| 回环位置 | WorkflowEngine.runPendingSteps：evaluator 完成后检查评分→自动置 writer pending+feedback 重跑 | StepRunner 内部回环 | 引擎管状态流转与次数上限，runner 保持无状态；复用打回机制 = 改动面最小 |
| 二评仍低 | 工作流正常 completed，在评估报告与总览标注"未收敛（1 轮重写）" | 标 failed | 产品如实交付"当前最好结果+已知缺陷"，与"如实标注不静默"一致 |
| 版本去重 | repos.artifacts.create 前比较与同 workflow 同 name 最新版 content，相同则跳过 | hash 比较/字段级 diff | 内容完全相等才去重，保守正确；长度比较前置避免全文字符串比对开销 |
| 文档补位（已确认：白名单定向抓取，按行业调研修正——见 docs/research/2026-09-01-web-content-acquisition-survey.md） | 三层：L0 先探测 `.md` Markdown 版页面（llms.txt v2 惯例，AI 框架文档多为 Mintlify 托管、普遍支持）→ L1 失败回退 HTML 简化去噪（Node 内置剥 script/style/nav，不引 Python 依赖）→ L2 正文截断（≤2000 字符/篇、每缺口 ≤3 篇）；白名单域 + fetch 可达性双重校验（不过即弃，防幻觉链接）；"官方文档参考"附加段写入 research-cards（不进引用编号与核验序列） | DeepSeek/第三方 web search（无法限定白名单域、可核验性弱、演示不可预算）；全量阅读（Firecrawl 以"省 93% token"为卖点印证预算化是行业纪律）；引入 Firecrawl/Jina 托管（提交后可选升级） | writer 直接获得框架实践的补充素材，缓解"框架实践无证据落地"；`.md` 直取路径零提取器成本；LLM 编造 URL 由 fetch 校验兜底（与 judge 幻觉编号 id 校验同一防御哲学） |

## Review 发现与修正（自查）

- [major] 引擎自动打回 writer 时，writer 可能正处于 approved 状态——需将 writer 及其后所有步骤重置为 pending 再注入 feedback，与人工打回 modify 的既有路径共用同一状态迁移函数，避免两套语义。
- [major] 二评低分判定必须与一评同口径（都读规则口径表），否则"重写后分数没变"无法判定；评估分数若因检索池变化（selector 未重跑）而波动属正常，只对比重写前后。
- [minor] 重写会再产生一版 02-draft.md——版本去重已保证"内容没变不升版本"，重写后内容必然变化，版本语义自洽。
- [minor] B 组触发会多一轮模型调用（writer 重写 + 二评，约 ¥0.3-0.4 / 3-5 分钟），录制时间线可接受；DEMO 模式 MockStepRunner 同步加低分→重写演示路径，录屏可用零成本彩排。
- [minor] C 组白名单链接可能随官网改版失效——链接标注"访问日期 2026-09"，且仅作建议不参与核验。

## 实现步骤

1. **A1 覆盖矩阵**：coverage.ts render()——covered 行 suggestion 改为"—"。
2. **A2 版本去重**：repositories.ts artifacts.create——查同 workflow+name 最新版，content 全等则直接返回旧记录（不插入）。
3. **A3 证据门槛**：SelectorStepService——入选集合过滤 `!abstract && downloadStatus!=='ok'` 的候选（移入 candidates 池标注"仅题录：无摘要无全文"）；downloadAndPersist 失败后对 failed 卡片做 1 次 Unpaywall 补偿重试（带现有超时）。
4. **B 评估闭环**：
   - WorkflowEngine：evaluator 步骤 approved 后解析 evaluation-scores.md 规则表 → 低分则把 writer 及后续步骤重置 pending、writer.setPendingFeedback(批评要点)、继续 runPendingSteps；`iterationUsed` 集合限 1 次；报告头部与总览加"未收敛"标注位。
   - prompts.ts：writer prompt 已支持 feedback 注入，无需改。
5. **C 文档补位**：新模块 `src/search/officialDocs.ts`——框架锚点→docs 域白名单映射（AutoGen/LangGraph/CrewAI/Mem0/Letta-MemGPT/MetaGPT）；按缺口子问题生成 URL 候选；**L0 `.md` 直取优先 → L1 HTML 简化去噪兜底**（白名单+fetch 双校验，复用 http.ts 超时）；正文截断（≤2000 字符/篇、≤3 篇/缺口）；写入 research-cards 附加段"官方文档参考（不进引用编号）"；coverage-matrix 缺口建议标注"已附官方文档 N 篇"。调研依据：docs/research/2026-09-01-web-content-acquisition-survey.md。
6. **MockStepRunner**：模拟低分评估 + 重写路径 + 官方文档附加段，DEMO 可彩排。
7. **测试**：coverage 渲染用例（covered 行"—"）；版本去重用例；selector 门槛用例（无摘要不入选）；引擎闭环用例（低分→重写 1 次→二评→完成/未收敛标注）。

## UI 预览

评估闭环触发时对话流出现系统标记（复用打回样式）：

```text
┌ 评估证据 ────────────────────────────────┐
│ ⚠ 综合分 2.9（<3.5）· 完整性 2（<3）      │
│ 自动打回写作：补充「记忆共享与冲突」「框架 │
│ 实践对比」两个缺失章节的证据支撑（第 1 轮/上限 1 轮）│
└──────────────────────────────────────┘
（writer 重写 → 二评）
┌ 评估证据（第 2 轮）──────────────────────┐
│ 综合分 3.8 · 已收敛 ✓  /  仍未收敛（已达上限，如实标注）│
└──────────────────────────────────────┘
```

## 测试与验证

- 单测四组（见实现步骤 7），全绿 + typecheck
- 真实验证：重跑同一窄题（¥1 左右），核对：无摘要卡不入池、矩阵列不重复、若低分则自动重写一轮且二评可读、版本无空转
- DEMO 彩排：DEMO_MODE 走低分→重写路径，录屏预演

## 文档更新清单

- runbook：评估闭环行为 + "未收敛"语义 + 仅题录说明
- INDEX.md：本 issue/plan 行

## 验收标准

- [ ] issue 验收标准全绿
- [ ] 真实运行窄题：证据池零空卡、闭环可观测（或达标免触发）、版本无空转
- [ ] **来源标注贯穿**：research-cards 文档参考段逐篇标注 URL/站点/访问日期；writer 草稿采用文档内容处可见来源（如"（依据 Mem0 官方文档）"）；coverage-matrix 标注"已附官方文档 N 篇"；导出物附文档链接清单
- [ ] typecheck / test 全绿
