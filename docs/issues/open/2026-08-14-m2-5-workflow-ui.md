---
title: M2-5 工作流 UI（列表、步骤时间线、产物预览、审批、实时事件）
status: active
created: 2026-08-14
updated: 2026-08-14
kind: feature
priority: high
triage: actionable
areas: [web, server, shared]
depends_on:
  - "docs/issues/close/2026-08-14-m2-4-evidence-citation.md"
resolution_plan: "docs/plans/open/2026-08-14-m2-5-workflow-ui.md"
---

# M2-5 工作流 UI

## 背景

后端四步工作流（Planner → Researcher → Writer → Reviewer）已真实闭环，但前端仍是 M1 三栏占位页。M2-5 让整个流程在浏览器里可操作、可观察：创建任务、看步骤推进、审阅每步产物、审批放行，并通过 WebSocket 实时刷新。

## 目标

- 左侧：工作流列表 + 新建（研究问题 + 四步模板）
- 中间：详情：步骤时间线（状态）、产物标签页（01-plan / research-cards / 02-research / citation-lint / 03-draft / 04-review）、审批面板
- 右侧：证据 / 引用摘要（检索统计、引用检查结论）
- 实时：WS 推送 workflow / step / artifact / decision / search.completed，界面自动更新
- 演示：DEMO_MODE=1 时无需模型 key 即可跑通全流程（MockStepRunner 产出合规产物）

## 范围（做）

- server：`GET /workflows` 列表端点；真实 WebSocket（ws 包挂在 HTTP server 上，事件总线广播）；DEMO_MODE 演示模式 MockStepRunner
- web：安装 zustand；api 客户端；store；组件（列表 / 详情 / 时间线 / 产物标签 / 审批 / 证据）；WS 连接；vite `/ws` 代理
- 测试：web store / 组件、server WS 集成、MockStepRunner、列表端点
- 文档：architecture / runbook / INDEX

## 不做

- 认证、多用户、删除 / 编辑工作流
- 步骤重试 / 修改、产物编辑
- 论文详情页、引用图谱
- Electron、移动端适配
- 深度视觉打磨与 Markdown 渲染库（M3）

## 验收标准

- [ ] 前端可新建并启动工作流
- [ ] 步骤时间线随执行实时推进（pending / running / awaiting_approval / approved / failed）
- [ ] 六类产物可在标签页预览
- [ ] 审批按钮生效（approve / reject + 备注）
- [ ] WS 推送后界面自动更新
- [ ] DEMO_MODE=1 无 key 全流程可跑
- [ ] typecheck / test 全绿，runbook 更新

## 关联

- 依赖：M2-4（已合并）
- 后续：M3 增强（引用雪球、模型精排、Markdown 渲染、打磨）与申报
