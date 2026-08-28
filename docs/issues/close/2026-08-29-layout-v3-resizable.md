---
title: 三栏可拖拽自适应布局（layout v3）
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: ux
priority: high
triage: planned
areas: [web]
---

# 三栏可拖拽自适应布局（layout v3）

## 背景

用户实测反馈左侧拥挤：216px 里垂直堆 7 层 UI（logo/新建按钮/搜索/chips/区头/列表/状态行），
行距紧、宽度不足；三栏宽度固定不可调，大屏下中栏 720px 偏窄。对标 Claude.ai（侧栏 ~260px、
内容区宽松）规格偏窄一档。

## 目标

1. 左栏默认 **260px**、右栏默认 **260px**（1080–1280 视口段保主栏宽度，可拖至 360）、中栏阅读宽 **780px**；
2. 三栏宽度**可拖拽调整**：栏间 6px 分隔热区，左栏 220–340px、右栏 220–360px，宽度持久化；
3. 左栏内部间距重排，解除拥挤感。

## 范围（做）

- 栏间 `ColumnDivider`：pointer capture 拖拽（rAF 不需要，React 状态批处理足够）、
  双击重置默认、键盘 ←/→ 微调 16px（role=separator，a11y）；
- 宽度持久化 localStorage（`rw.layout`，JSON {left,right}，损坏回退默认）；
- grid 模板用 CSS 变量：`grid-cols-[var(--rw-left)_6px_minmax(0,1fr)...]`，
  右分隔线与右列仅 lg+（1080px 断点，沿用现有抽屉方案）；左分隔线全宽显示（左栏恒为静态列）；
- 左栏间距重排：logo 区加高、搜索/chips/区头间距 +4px、列表条目 py-2.5 + leading-[1.5]；
- 中栏 max-w 720→780（header 与 ChatFlow 同步）。

## 不做

- 折叠成图标条模式；右栏抽屉逻辑改动；中栏多列/瀑布流。

## 验收标准

- [ ] 拖拽流畅无跳变，松手后宽度持久，刷新保留；
- [ ] 双击分隔线重置默认；键盘可调（±16px/次）；
- [ ] <1080px 无右分隔线、抽屉行为不变；
- [ ] 宽度参数有纯函数单测（clamp/持久化容错）；
- [ ] typecheck / test 全绿。
