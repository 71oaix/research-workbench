---
title: 状态语义与语言一致性（plan）
status: archived
created: 2026-08-28
updated: 2026-08-28
issue: "docs/issues/close/2026-08-28-status-semantics.md"
areas: [web]
---

# 状态语义与语言一致性（plan）

## 任务摘要
状态呈现全部中文化、指示灯与真实连接状态一致、paused 态不再渲染运行时假象（spinner + 全 0 计数）。

## 为什么做
paused 是审批等待态，却显示"检索中" spinner 和"已命中 0"（App.tsx:77-87）；界面混有
`状态：completed`、`WS open`、决策 pill `modify/approve` 等开发者视角文案，演示穿帮。

## 预计效果
- 任何状态下无语言/语义矛盾；状态信息一处表达不重复；
- 断连时指示灯变红灰并有中文说明；决策历史人类可读。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| paused 计数行 | 直接不渲染 | 保留但显示缓存值 | live 计数 selectWorkflow 已清零，缓存值会误导；paused 无"进行中"语义 |
| 状态元信息行 | 删除 `状态：<raw>`，计数合并为"N 个步骤 · M 份产物" | 保留两处状态 | pill 已表达状态，重复且语言不一致 |
| WS 指示灯 | 三态（open=绿点/已连接，connecting=蓝点呼吸/连接中，closed=红点/连接断开） | 文案区分 | 色彩+文字双通道，无障碍冗余 |
| 决策类型 | 中文映射 approve→已通过 / modify→打回修改 / reject→已取消 + 相对时间 | raw type | 用户视角 |
| 版本 tab | `v1 / v2` | `版本 v1` | tab 语境自明 |

## Review 发现与修正
- [minor] `test/App.test.tsx:106` 硬断言 `状态：planning` → 修正：步骤 2 明确包含更新该断言。
- [minor] `DecisionType` 还含 `retry`（types.ts:27，UI 不可达但数据合法）→ 修正：DECISION_LABEL
  补 `retry: '已重试'`，覆盖完整类型。
- [minor] App.tsx:10-17 已有本地 STATUS_LABEL/STATUS_PILL → 修正：整体迁入 labels.ts，
  App 改为导入，避免双份事实源。

## 实现步骤
1. `apps/web/src/lib/labels.ts`：新建共享标签模块——STATUS_LABEL、STATUS_PILL（自 App 迁入）、
   WS_STATUS_LABEL、DECISION_LABEL（含 retry）、relativeTime()（供 App/WorkflowList/ApprovalPanel 复用）。
2. `App.tsx`：删除 `状态：{status}` span；步骤/产物合并为一句；spinner 行条件收紧为
   `status === 'executing'`；同步更新 `test/App.test.tsx:106` 断言（改为 pill 文案"待启动"）。
3. `WorkflowList.tsx`：底部状态行改用三态色点 + 中文文案（bg-ok/bg-run animate-pulse/bg-bad）。
4. `ApprovalPanel.tsx`：决策 pill 用 DECISION_LABEL + relativeTime(createdAt)。
5. `ChatFlow.tsx`：版本 tab 文案 `v{n}`。

## 测试与验证
- 更新 `test/App.test.tsx` 受影响断言（若引用了"状态："文案）；
- 新增 `test/labels.test.ts`：relativeTime 边界（刚刚/N 分钟前/N 小时前/昨天/N 天前/日期回退）、
  DECISION_LABEL 全覆盖；
- `npm run typecheck --workspace @research-workbench/web && npm test --workspace @research-workbench/web`。

## 验收标准
- [ ] paused 工作流详情页无 spinner、无计数行
- [ ] grep 无 `状态：completed` / `WS open` / `>modify<` 直出
- [ ] 断开 WS 显示红点 + "连接断开"
- [ ] 决策历史含中文类型 + 时间
- [ ] typecheck / test 全绿
