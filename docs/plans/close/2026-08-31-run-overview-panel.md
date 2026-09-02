---
title: 右栏运行总览面板（状态机 + 成本 + 资产）（plan）
status: archived
created: 2026-08-31
updated: 2026-09-03
issue: "docs/issues/open/2026-08-31-run-overview-panel.md"
areas: [server, web]
---

# 右栏运行总览面板（plan）

## 任务摘要

在右栏顶部新增"运行总览"卡，把分散的信息集成到一处：**7 角色状态机**（现在走到哪）、**成本**（花了多少）、**资产**（手里有什么）。数据 90% 现成：成本已持久化且聚合查询已存在，WS 已广播增量；只差 detail 快照带上成本、前端接住增量、一个展示组件。**不碰引擎/检索/流式链路**，是提交前的纯展示层最终优化。

## 为什么做

- 竞赛叙事"全过程可观测"需要一个标志性界面：研究者不点开任何步骤卡，扫一眼右栏就知道位置、成本、资产；
- 成本透明是现成卖点：`usage_records` 表 + `summaryByWorkflow` 聚合早已存在，只是前端把 `usage.recorded` 事件丢了（store.ts 空 case）；
- 论文数现状只有运行中的 live 计数，刷新即丢，资产栏顺带修复。

## 预计效果

- 打开任意工作流即见总览卡：状态机位置正确、当前步骤 + 累计耗时、成本三件套（¥ / 次数 / tokens）+ 可展开的角色明细、资产一行（论文 N · 产物 N · 决策 N · 覆盖矩阵 ✓/—）；
- 运行中所有数字实时增长（usage.recorded 增量），刷新/切换工作流后数字不丢（来自 detail 快照）。

## 关键决策

| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 总览卡与 ProgressRail 关系 | 置顶新增，ProgressRail/ArtifactFileTabs 原样保留 | 吸收合并成单一面板 | 改动面最小、不回退已有交互；总览看全局、明细可跳转，粒度分层 |
| 成本接口 | 并入 `engine.getDetail` 快照（+1 行查询） | 独立 `GET /usage` 端点 | detail 已是前端全量快照，start/decide/cancel 后自动携带最新值，前端零新增拉取逻辑 |
| UsageSummary 类型 | 移入 `packages/shared`，data/server/web 三端共用 | 各端重复定义 | 数据包的类型已 import shared（UsageRecord 先例），web 不直接依赖 data 包 |
| 论文数来源 | 前端 `parseCards(research-cards.md)` 计数 | server 加 papers count | papers 表是全局去重缓存（无 workflow 关联），工作流维度的真实资产是证据卡；零后端改动 |
| 增量更新 | store 把 `usage.recorded` 按 workflowId 过滤后 upsert 进 `detail.usageSummary` | 收到增量就 refreshList / 单独累计字段 | detail 保持唯一事实源，刷新快照时累加自然重置，不引入双份状态 |
| 状态机形态 | 横向 7 个小图标节点 + 连线，点击跳转对应步骤卡（复用 ProgressRail 跳转逻辑） | 纵向列表（与 ProgressRail 重复）/ 文字进度条 | 260px 栏宽下 7×20px 节点单行可行；点击跳转保留可达性 |
| 耗时 | 前端计算：`createdAt → 最后事件时间`，executing 时每秒 tick（组件内局部 state） | server 记录时长字段 | 零后端改动；tick 只重渲染总览卡自身 |
| DEMO 模式成本 | MockStepRunner 补发少量模拟 usage 事件 | 接受演示显示 ¥0.00 | 成本透明是竞赛卖点，演示不能空白；改动约几行 emit |

## Review 发现与修正（自查）

- [major] `summaryByWorkflow` 按 (stepId, role) 分组，同一角色多轮迭代（selector gap 回环）会产生多行 → **修正**：RunOverview 展示层必须按 role 二次聚合求和；store 只做行级累加，不按 role 合并（保留明细语义）。
- [major] 260px 右栏（MIN_RIGHT 更窄时）横向 7 节点可能拥挤 → **修正**：节点 20px、隐藏文字标签、`title` 提示，当前步骤名由下方文字行承担；实现后用 200px 栏宽目测验收。
- [minor] `usage.recorded` 的 workflowId 理论上可能为 null → store 过滤 `usage.workflowId === detail.workflow.id`，null 天然丢弃。
- [minor] aside 目前无滚动样式，加总览卡后右栏可能超高 → aside 加 `overflow-y-auto`。
- [minor] 耗时终点：completed/cancelled/failed 时应停在 workflow.updatedAt 而不是持续走表 → tick 仅在 `executing` 状态启用。

## 实现步骤

1. **shared**：`types.ts` 增加 `UsageSummary` 接口（从 data 包 `repositories.ts:72` 原样迁入）；data 包改为 import 并 re-export。
2. **server**：`WorkflowEngine.WorkflowDetail` 接口加 `usageSummary: UsageSummary[]`；`getDetail` 追加 `usageSummary: this.repos.usage.summaryByWorkflow(workflowId)`。
3. **web api.ts**：`WorkflowDetail` 加同名字段，类型从 shared 引入。
4. **web store**：`case 'usage.recorded'`：workflowId 匹配时把 record 累加进 `detail.usageSummary` 对应 (stepId, role) 行（无则新增行），新 detail 对象 set。
5. **web 组件 `RunOverview.tsx`**：
   - 状态机行：从 `steps` 按 role 取最新一条派生节点状态（复用 `labels.ts`/状态色），点击节点 `expandStep + scrollIntoView`；
   - 文字行：当前步骤 label + 状态（待审批高亮）+ 累计耗时（executing 时每秒 tick）；
   - 成本块：按 role 聚合 `usageSummary` → 总额/次数/tokens 常显，`<details>` 或本地 state 折叠角色明细；
   - 资产行：`parseCards(research-cards.md)` 论文数 · `artifacts.length` 产物 · `decisions.length` 决策 · coverage-matrix.md 有无；
   - 置入 `App.tsx` aside 顶部，aside 加 overflow。
6. **MockStepRunner**：每次步骤完成 emit 1 条模拟 `usage.recorded`（构造合理 token 数与 costCny）。
7. **测试**（见下）。

## UI 预览

```text
右栏（自上而下）
┌────────────────────────────┐
│ 运行总览                    │
│ ●──●──◉──○──○──○──○        │ ← 7 角色节点：实心=已通过 脉冲=进行中
│ 进行中：筛选证据 · 12 分 08 秒│    空心=排队 红=失败/已打回
│ 等待你的审批 ▸（paused 时）  │
│────────────────────────────│
│ 成本                        │
│ ¥0.34 · 23 次调用           │
│ 输入 12.4k · 输出 8.2k      │
│ ▾ 按角色明细                │
│   planner    ¥0.02 · 2 次  │
│   researcher ¥0.04 · 3 次  │
│   selector   ¥0.11 · 9 次  │
│   writer     ¥0.15 · 4 次  │
│────────────────────────────│
│ 资产                        │
│ 论文 28 · 产物 6 · 决策 3    │
│ 覆盖矩阵 ✓                  │
│────────────────────────────│
│ 执行进度（ProgressRail 原样）│
│────────────────────────────│
│ 产出文件（ArtifactFileTabs）│
└────────────────────────────┘
```

## 测试与验证

- 单测（server）：`engine.test` 追加 detail 含 usageSummary 断言；`repositories.test` 补 `summaryByWorkflow` 聚合正确性用例（如缺）。
- 单测（web）：`RunOverview.test.tsx`——节点数/状态派生、成本按 role 聚合求和、论文数=卡片数、明细折叠；`store.test` 追加 usage.recorded 累加与跨工作流过滤用例。
- 手动：`npm run dev`（预览 `http://localhost:5173`）→ ① DEMO_MODE=1 跑通全流程看总览卡数字增长与演示成本；② 真实模式跑一轮，抽查金额与 `usage_records` 表 SUM 一致；③ 刷新页面数字不丢；④ 右栏拖窄至 200px 目测状态机不溢出。

## v2 修订：消除与执行进度的重叠 + 仪表盘美化（2026-08-31，用户确认）

### 问题
v1 实测后用户指出两点：① 总览卡的状态机节点行与 ProgressRail 步骤列表信息重复（7 节点 vs 7 行同一状态）；② 成本/资产展示太朴素（纯小字文本，无图形）。

### 用户确认的方案
1. **重叠消除 = 升级步骤列表为状态机**：删除总览卡的节点行；ProgressRail 升级——已完成行右侧改显**该步耗时**（替代"已通过"文案），当前步骤节点加脉冲动画；保留点击跳转。一种信息一种视图。
2. **成本仪表盘 = 大数字 + 角色条形排行**：金额升为 22px 衬线大字；按角色成本渲染水平条形（按金额降序、相对最大值定宽、金额 0 的角色不占行、右端标金额），**替代**"按角色明细"折叠交互（图常显，无需展开）；下方一行小字显示调用次数与 tokens。
3. 总览卡顶部保留"当前步骤 + 累计耗时"行；资产行加图标（Book/File/Scale/Filter）。

### 实现步骤（v2）
1. `lib/format.ts`：抽出 `fmtDuration`（RunOverview/ProgressRail 共用；<1s 显示 `<1秒`）。
2. `RunOverview.tsx`：删节点行与折叠明细；新增条形排行（`bg-surface2` 轨道 + `bg-accent` 填充）；大数字排版；资产加图标。
3. `ProgressRail.tsx`：已通过行显示 `fmtDuration(updatedAt-createdAt)`；current 节点加 `animate-pulse`。
4. 测试：RunOverview.test 断言改为条形排行（行数=非零金额角色数、含金额文本）；App.test 无状态文案依赖（已核实）。

### 验收标准（v2 追加）
- [ ] 右栏不再有两处步骤状态视图；已完成步骤可见各自耗时
- [ ] 成本条形排行常显、按金额降序、无折叠按钮
- [ ] typecheck / test 全绿

## 文档更新清单

- `docs/guide/runbook.md`：运行总览卡说明（成本口径、DEMO 模拟成本）
- `docs/INDEX.md`：本 issue/plan 行（随本 PR 落地）

## 验收标准

- [ ] 总览卡三块（状态机/成本/资产）可见且数字正确
- [ ] 刷新/切换工作流数字不丢；运行中实时增长
- [ ] DEMO 模式成本非零
- [ ] typecheck / test 全绿
