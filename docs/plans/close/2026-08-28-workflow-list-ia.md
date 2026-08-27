---
title: 工作流列表信息架构（plan）
status: archived
created: 2026-08-28
updated: 2026-08-28
issue: "docs/issues/close/2026-08-28-workflow-list-ia.md"
areas: [web]
---

# 工作流列表信息架构（plan）

## 任务摘要
左栏列表增加搜索与状态过滤；条目副信息改为"相对时间 + 状态词"，删除 UUID 片段；
选中态加 accent 指示条；空态给引导动作。

## 为什么做
真实库 44 条工作流，多轮迭代主题高度相似，截断后无法辨认（截图实证）；副信息
`id.slice(0,8)` 是调试信息泄露；状态仅 6px 色点无文字佐证，planning 与 cancelled 同灰。

## 预计效果
- 3 秒内定位目标工作流；列表信息对人有意义；
- 状态可读性不依赖色彩辨识力。

## Review 发现与修正
- [minor] 依赖 status-semantics 先建的 `src/lib/labels.ts`（relativeTime/STATUS_LABEL）→
  修正：标注实施顺序在 status-semantics 之后，同一分支按序实现。
- [minor] chips 词汇与全站 STATUS_LABEL 口径（planning=待启动）冲突 → 修正：chips 为
  全部 / 进行中(executing) / 待审批(paused) / 已完成(completed)；planning/failed/cancelled
  仅计入"全部"，词汇不冲突。
- [minor] "搜索 <50ms"无法自动化验证 → 修正：降为手工检查项，自动化验收改为过滤结果
  条目数断言。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 过滤实现 | 纯前端 useMemo（关键词包含匹配 goal + 状态 chips） | 后端搜索接口 | 量级百以内，即时响应 |
| chips 分组 | 全部 / 进行中(executing) / 待审批(paused) / 已完成(completed)，planning/failed/cancelled 归入"全部"（以 Review 修正为准） | 6 状态全铺 | 216px 窄栏放不下 6 chips；失败/取消低频 |
| 副信息 | relativeTime(createdAt)（复用 labels.ts） | 绝对时间+UUID | 人看的是"多久之前" |
| 选中指示 | 左缘 2px accent 条（inset box-shadow 实现） | 仅白底 | 白底在 hover 态有歧义 |
| 空态 | 图标+文案+"新建调研"按钮（打开既有弹层） | 纯文案 | 给动作不给死胡同 |

## 实现步骤
1. `WorkflowList.tsx`：
   - 顶部搜索输入（h-8、Esc 清空、Enter 打开新建弹层并带入关键词）；
   - chips 行（复用 STATUS_DOT 色板 + 计数，useMemo 统计）；
   - 列表项：relativeTime + STATUS_LABEL[status]；active 加左指示条；
   - 空态（workflows 为 0）：IconSpark + 文案 + 按钮；
   - 过滤后为 0：显示"无匹配结果"行。
2. 无新增依赖；store 不改（过滤是纯视图逻辑）。

## 测试与验证
- `test/WorkflowList.test.tsx` 新增：输入关键词后列表条目数变化；chips 计数正确；
  点击"待审批"chip 只剩 paused 条目；空库渲染 CTA 按钮；
- 手工：真实 44 条数据下过滤即时、定位顺畅；
- typecheck + web test 全绿。

## 验收标准
- [ ] 过滤即时（手工确认 n=44 无卡顿）；chips 计数与列表一致（自动化断言）
- [ ] 无 UUID 泄露；副信息为中文相对时间+状态词
- [ ] 空库/无匹配两态有引导
- [ ] typecheck / test 全绿
