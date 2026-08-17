---
title: M2-15 模糊问题澄清 + 标题摘要筛选 + 下载候选增强（plan）
status: active
created: 2026-08-18
updated: 2026-08-18
issue: 2026-08-18-m2-15-clarify-and-select-papers
areas: [server, web]
---

# M2-15 模糊问题澄清 + 标题摘要筛选 + 下载候选增强（plan）

## 任务摘要

解决“召回高、精度低”：宽泛问题（如“研究下什么是 agent”）在规划阶段先向用户澄清锚定点再检索；
新增 selector 角色对检索候选池做“标题 + 摘要”批量深入筛选（内容/场景/创新点），只有入选论文才下载全文、
进证据池；对单候选论文补 Unpaywall 下载兜底。

## 为什么做（原因）

M2-14 真实运行：召回 1113/797 目标达成，但 top-15 混入“太极统一场论”“谣言传播”“大学英语教学”等
5-6 篇明显无关论文，模型评估与审查因此打回。根因是两层策略缺失：

1. 问题拆解：planner 对模糊问题不提问，直接抓关键词开搜，锚点没有先和用户对齐；
2. 筛选方法论：论文的标题与摘要是判断是否值得读全文的第一依据，当前是“全量下载 + 引用数/主题词加权”，
   缺少“批量深入分析标题摘要（内容、场景、创新点）”的筛选环节。

另外 M2-14 有 3/9 论文因只有 1 个 PDF 候选而下载失败，需补候选源。

## 预计效果

- 宽泛问题：第一轮 plan 含“澄清请求”，用户审批意见回答后，第二轮 plan 锚点明显收敛
  （关键词组 ≥5 且包含领域/场景实体）；
- 入选精度：top-15 明显无关论文从 M2-14 的 5-6 篇降到 ≤2 篇（不再出现“太极统一场论”类条目）；
- 每张入选卡片附“筛选理由”（内容/场景/创新点与问题匹配度），可回溯；
- 单候选论文下载失败率下降（Unpaywall 兜底）；
- 检索阶段不再全量下载，候选池 30-50 篇 + selector 模型筛选，整体耗时预算 ≤20 分钟、成本增量 ≤¥0.5。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 模糊检测 | planner 模型自判（prompt 规则：缺领域/对象类型/场景/时间范围任一即输出“澄清请求”小节） | 纯规则检测关键词数量 | 模糊是语义问题，模型自判更准；规则误触发由用户在审批意见直接回答可回退 |
| 澄清交互 | 复用现有审批机制：plan 含“澄清请求”+ UI 审批面板提示条，用户以审批意见回答，planner 重跑吸收 | 新增独立澄清对话状态机 | 零状态机改动，符合“人只做决策”的流程；planner prompt 已有“锚点修订”能力 |
| 流程拆分 | researcher 只产出“检索候选池”（30-50 篇标题+摘要，不下载）；新增 selector 角色（模型筛选 → research-cards.md → 代码触发入选下载） | 维持“检索即下载” | 先筛后下，下载只花在值得读的论文上 |
| selector 审批 | 自动执行（requiresApproval=false），入选理由进卡片、剔除清单进候选 artifact | selector 也设为审批点 | 避免打断流程；writer/evaluator/reviewer 兜底纠偏，筛选报告可回溯 |
| 编号解析 | selector 输出按 `### [N]` 解析；解析失败时回退“全部候选下载”安全网 | 解析失败即报错 | 模型输出不稳定时保证流程不中断 |
| Unpaywall | `SEARCH_UNPAYWALL_EMAIL` 可配，DOI 存在且无候选/候选失败时查询补 PDF 候选 | 默认不启用 | 依赖外部 API，失败静默不影响主流程 |

## Review 发现与修正

> 已完成独立对抗性审查，发现与处理如下：

- [major] selector 模型筛选可能漏选/错选，错误会传导到 writer → 修正：规则预筛（主题词命中）保留为第一层；
  每篇入选卡片强制附理由；剔除清单落 artifact 可回溯；writer/evaluator/reviewer 三层兜底；
  若精度仍差，后续把 selector 改为可审批点。
- [major] 候选池 40 篇 + 模型筛选增加耗时与成本 → 修正：每篇理由限 120 字模板输出、摘要截断 300 字，
  预估增量 2-3 分钟、¥0.3-0.5；检索阶段去掉全量下载抵消部分耗时。
- [major] planner 澄清可能误触发（精确问题也提问）→ 修正：仅当问题缺领域/场景/对象类型锚点时触发；
  误触发时用户直接在审批意见回答即可，不阻塞；无澄清请求时行为与现状一致。
- [minor] selector 输出格式不稳定 → 修正：编号解析失败回退“全部候选下载”，保证卡片与全文不缺失。
- [minor] Unpaywall 依赖外部服务 → 修正：可配开关、失败静默、不影响主流程。
- 未发现其他遗留风险。

## 实现步骤

1. **P0-1 规划澄清（planner + web）**
   - `prompts.ts`：planner 系统提示词增加澄清规则（缺领域/对象类型/场景/时间范围 → 输出“## 澄清请求”小节，
     只列 2-4 个问题，不展开搜索计划）；
   - `ApprovalPanel.tsx`：检测最新 `01-plan.md` 含“澄清请求”时显示提示条
     “该计划需要澄清，请在意见中回答以下问题”，并把问题列表渲染出来；
   - 默认模板不变（planner 仍需审批），用户回答走既有 modify 流程。
2. **P0-2 selector 角色与流程拆分（shared + server + web）**
   - `shared/types.ts`：`Role` 加 `'selector'`；
   - `index.ts` / `piConfig.ts`：ROLES、角色循环加 `'selector'`（`PI_MODEL_SELECTOR` / `PI_THINKING_SELECTOR`）；
   - `prompts.ts`：`ROLE_SYSTEM_PROMPTS['selector']`（逐篇模板：内容/场景/创新点/匹配判定/入选或剔除 + 理由，
     输出 `research-cards.md`）、`ARTIFACT_NAMES['selector'] = 'research-cards.md'`；
   - `researcherStep.ts`：改为产出 `research-candidates.md`（候选池 30-50 篇，标题+摘要，摘要缺失补抓或剔除），
     不再下载全文、不再产出 research-cards.md；
   - 新增 `SelectorStepService`（或并入 EvidenceStepService）：`prepareSelector`（候选池 + plan 锚点 → promptExtra）、
     模型输出后解析入选编号 → 对入选论文执行 `acquireFullText`（并发 3）→ 回填卡片状态行 →
     落库 `research-cards.md` 与 `paper-fulltext.md`；
   - `PiStepRunner.ts`：selector 分支（模型调用 + 确定性下载回填）；`MockStepRunner`：selector case；
   - `config.ts`：`candidateTop`（`SEARCH_CANDIDATE_TOP` 默认 40）；
   - `web`：默认模板六步（researcher 后插“筛选证据”步骤，`requiresApproval=false`）；
     `StepTimeline.tsx`：`selector: '筛选'`；
   - 打回语义不变：researcher 打回重跑候选池 → selector 重跑；writer 打回只重跑 writer 及之后。
3. **P1-1 Unpaywall（server）**
   - `config.ts`：`unpaywallEmail`（`SEARCH_UNPAYWALL_EMAIL`，默认空）；
   - `fullText.ts`：`resolvePdfUrls` 在无候选或候选失败时，若有 DOI + 配置 email，查询
     `https://api.unpaywall.org/v2/{doi}?email=` 取 `best_oa_location.url_for_pdf` 追加候选（失败静默）。
4. **测试 / 文档 / 验证脚本**：见下。

## 测试与验证方案

- 单元测试：
  - planner prompt：含澄清规则断言（prompts 快照）；
  - selector：`prepareSelector` promptExtra 含候选池与锚点；编号解析（mock 模型输出 → 入选集合）；
    解析失败回退全量下载；下载后卡片状态行与 paper-fulltext 编号一致；
  - researcher：产出 `research-candidates.md` 且不调用 `acquireFullText`；
  - Unpaywall：mock fetch 断言 URL/email 参数、候选追加、失败静默；
  - web：审批面板对含“澄清请求”的 plan 显示提示条；默认模板六步；StepTimeline 含 selector 标签。
- 真实运行：`node scripts/verify-m2-15.mjs`——(a) 宽泛问题“研究下什么是 agent”第一轮 plan 含澄清请求，
  用审批意见回答后第二轮锚点收敛；(b) 完整六步流程 top-15 无明显无关论文、卡片带筛选理由。
- CI：typecheck + test 全绿。

## 验收标准

- [ ] 宽泛问题第一轮 plan 含“澄清请求”，意见回答后第二轮锚点明显收敛
- [ ] 真实运行候选池 30-50 篇，top-15 明显无关论文 ≤2（无“太极统一场论”类条目）
- [ ] 每张入选卡片附筛选理由；剔除清单可回溯
- [ ] selector 编号解析失败时回退全量下载，卡片/全文不缺失
- [ ] Unpaywall 生效后单候选论文下载失败率下降
- [ ] typecheck / test 全绿

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：selector 角色、候选池拆分、澄清流程、Unpaywall；
- `docs/guide/runbook.md`：`SEARCH_CANDIDATE_TOP`、`SEARCH_UNPAYWALL_EMAIL`、`PI_MODEL_SELECTOR`、
  澄清交互说明、verify-m2-15；
- `docs/INDEX.md`：登记 M2-15 plan。

## 涉及 UI / 预览

两处小改动（线框图）：

```text
规划 → 检索 → 筛选 → 写作 → 评估 → 审查        （默认模板由五步变六步）
[规划] [检索] [筛选] [写作] [评估] [审查]
  ✓      ✓    running  ⏸

审批面板（plan 含“澄清请求”时）：
┌──────────────────────────────────────────────┐
│ ⚠ 该计划需要澄清，请在意见中回答以下问题：     │
│   1. 你关注的 agent 类型是？（单/多智能体）    │
│   2. 应用场景或领域是？                       │
└──────────────────────────────────────────────┘
```

本地预览：`npm run dev` → http://localhost:5173。
