---
title: M2-6 工作流多轮迭代与审批（打回修改、逐步检查、反馈注入）
status: active
created: 2026-08-15
updated: 2026-08-15
kind: feature
priority: high
triage: actionable
areas: [server, data, shared, web]
depends_on:
  - "docs/issues/open/2026-08-14-m2-5-workflow-ui.md"
resolution_plan: "docs/plans/open/2026-08-15-m2-6-workflow-iteration.md"
---

# M2-6 工作流多轮迭代与审批

## 背景

用户实测 M2-5 后发现：审批只有“通过 / 驳回”，驳回直接把整个任务取消；且默认只有首尾两步停下检查，研究任务必需的“多轮迭代”完全缺失。M2-6 把审批改造成人机协作循环。

## 目标

- 默认四步全部暂停等待检查（requiresApproval=true）
- 审批支持：通过 / 打回修改（带意见，重跑目标步骤）/ 取消任务（显式独立操作）
- 打回后：目标步骤及其后续步骤重跑，产物按版本累积（v1 / v2 ...），模型读取最新版本并响应修改意见
- 反馈注入：上一轮审批意见随 prompt 传给模型
- Reviewer 打回时回到 Writer 改稿，再自动重审
- UI 显示决策历史与产物版本

## 范围（做）

- shared：`Step` 增加 `pendingFeedback`；`StepRunInput` 增加 `feedback`
- data：`steps` 表新增 `pending_feedback`（migrate），repositories 读写
- engine：`decide` 支持 `modify`；打回循环；`reject` 保持显式取消
- runtime：反馈注入 prompt；读取最新 artifact 版本
- web：默认全审批步骤；审批面板三操作 + 决策历史；产物标签显示版本
- verify 脚本：逐步审批跑通，并演示一次打回闭环
- 测试与文档

## 不做

- 自由对话式聊天界面（审批意见已足够，M3 可扩展）
- 分支 / 并行步骤
- 任意步骤跳转重跑（限定“目标步骤及后续”）
- 步骤级撤销（版本历史保留，可回看）

## 验收标准

- [ ] 默认新建工作流四步全部暂停等待检查
- [ ] 打回修改后目标步骤重跑并再次暂停，产物生成新版本
- [ ] 修改意见出现在模型 prompt，产物内容体现响应
- [ ] Reviewer 打回 → Writer 重写 → Reviewer 重审
- [ ] 取消任务为独立操作，不再由“驳回”触发
- [ ] UI 显示决策历史与产物版本
- [ ] typecheck / test 全绿，verify 脚本逐步审批跑通

## 关联

- 依赖：M2-5（同分支待合并）
- 后续：M3 增强（对话式修改、自由重跑目标、界面打磨）与申报
