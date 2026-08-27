---
title: 状态语义与语言一致性（quick win：paused 假 spinner、raw English、WS 指示灯失真）
status: archived
created: 2026-08-28
updated: 2026-08-28
kind: bug
priority: high
triage: actionable
areas: [web]
depends_on:
  - "docs/issues/open/2026-08-28-ui-design-review.md"
---

# 状态语义与语言一致性（quick win）

> 总纲：[2026-08-28-ui-design-review.md](2026-08-28-ui-design-review.md) 专项 1

## 背景

状态是工作台类产品的"心跳"，当前存在一处行为 bug 和多处语言/语义不一致（截图验证）：

1. **paused 假 spinner（行为 bug）**：`App.tsx:77` 中 `executing || paused` 都渲染
   "检索中" spinner 与 live 计数行；截图 `ui-paused.png` 显示暂停待审批时 spinner 空转、
   "已命中 0 / 去重 0 / 已下载 0 篇"——用户会误以为检索没跑完或数据丢了。
   live 计数在 selectWorkflow 时被清零（store.ts:67），恢复查看 paused 工作流必然全 0。
2. **raw English 泄露**：`App.tsx:64` "状态：completed" 与顶部 pill "已完成" 同屏重复且
   语言不一致；`WorkflowList.tsx:156` "本地运行 · WS closed/open" 是开发者术语；
   `ApprovalPanel.tsx:116` 决策历史 pill 直出 `modify / approve`（截图 ui-approval2.png）。
3. **WS 指示灯失真**：`WorkflowList.tsx:155` 绿点硬编码 `bg-ok`，断连（closed）时依旧
   绿灯 + 文案说 closed，视觉与语义矛盾。
4. **版本 tab 命名冗长**：`ChatFlow.tsx:162` "版本 v1 / 版本 v2"，tab 语境下 "v1 v2" 足够。

## 目标

状态语言全部中文化、指示灯与真实状态一致、paused 态不渲染运行时假象。

## 范围（做）

- App.tsx：paused 不渲染 spinner 行；元信息行删除 "状态：<raw>"（与 pill 重复），
  保留步骤/产物计数但改为有意义的表述（如"7 个步骤 · 22 份产物"）；
- WorkflowList.tsx：连接指示灯三态化（open=ok 绿 / connecting=run 蓝呼吸 / closed=bad 灰红），
  文案改中文（"已连接 / 连接中 / 连接断开，重连中"）；
- ApprovalPanel.tsx：决策类型映射中文（approve→已通过 / modify→打回修改 / reject→已取消），
  决策条目补时间戳（createdAt 已有）；
- ChatFlow.tsx：版本 tab 文案改 "v1 / v2"。

## 不做

- 不改 WS 重连逻辑本身（store.ts 行为已合理，只改呈现）；
- 不做 i18n 框架（直接改文案，项目只面向中文用户）。

## 验收标准

- [ ] paused 工作流详情页无 spinner、无全 0 计数行；
- [ ] 全界面 grep 无 `状态：completed` / `WS open` 类 raw 状态串；
- [ ] 断开 WS（停后端）时左栏指示灯变灰/红，文案"连接断开"；
- [ ] 决策历史每条含中文类型 + 时间；
- [ ] web typecheck / test 全绿。
