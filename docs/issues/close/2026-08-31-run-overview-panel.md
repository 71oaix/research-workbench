---
title: 右栏运行总览面板（状态机 + 成本 + 资产）
status: archived
created: 2026-08-31
updated: 2026-09-03
kind: feature
priority: high
triage: planned
areas: [server, web]
resolution_plan: "docs/plans/open/2026-08-31-run-overview-panel.md"
---

# 右栏运行总览面板（状态机 + 成本 + 资产）

## 背景

比赛提交在即，需要一处"一眼看全"的运行状态展示作为最终打磨点。现状信息分散：工作流状态 pill 在标题栏、检索实时统计只在运行中显示且刷新即丢、成本数据后端已持久化并广播但前端 store 直接丢弃（`store.ts` 的 `usage.recorded` 分支为空）、资产数量散落在标题栏统计里。用户（研究者）跑一次调研无法回答三个基本问题：**现在走到哪一步、花了多少钱、手里有什么**。

## 目标

在右侧栏顶部新增一张**运行总览卡**，集成三类信息：

1. **状态机**：7 角色横向迷你流水线（实心=完成、脉冲=进行中、空心=排队、红=失败），一眼看出当前位置；下方文字行显示当前步骤 + 累计耗时；暂停时明确显示"等待你的审批"。
2. **成本**：累计金额（¥）、模型调用次数、输入/输出 tokens 常显；按角色明细默认折叠（对齐"成本透明"的竞赛叙事）。
3. **资产**：论文卡片数、产物份数、决策次数、覆盖矩阵有无，一行列出。

## 范围（做）

- server：`engine.getDetail` 响应追加 `usageSummary`（复用已有的 `repos.usage.summaryByWorkflow` 聚合查询）；`UsageSummary` 类型移入 shared 供三端共用
- web store：接住 WS `usage.recorded` 增量，按工作流过滤后累加进 `detail.usageSummary`
- web 组件：新增 `RunOverview` 总览卡，置于右栏顶部；"执行进度"（ProgressRail）与"产出文件"（ArtifactFileTabs）原样保留
- 论文数从前端已有的 `parseCards(research-cards.md)` 解析，不动 server 论文表（该表是全局去重缓存，与工作流无关联）
- DEMO 模式：MockStepRunner 补发模拟 usage 事件，保证演示时成本面板有数据

## 不做

- 独立 `/usage` REST 端点（并入 detail 快照即可）
- 成本预算/限额、历史趋势图、跨工作流汇总
- 引擎、检索、流式链路的任何改动（提交前不做性能调整）
- 总览卡吸收/替换 ProgressRail（保留现有交互，降低回归风险）

## 验收标准

- [ ] 右栏顶部可见总览卡：状态机位置与实际步骤状态一致，当前步骤 + 耗时正确
- [ ] 真实运行一次后成本金额、调用次数、tokens 与 usage_records 表汇总一致；按角色明细展开可读
- [ ] 刷新页面 / 切换工作流后成本与论文数不丢失（来自 detail 快照，不依赖 live 状态）
- [ ] DEMO_MODE 跑通后成本面板有模拟数据，不为 ¥0.00
- [ ] typecheck / test 全绿
