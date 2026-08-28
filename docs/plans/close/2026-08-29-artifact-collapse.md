---
title: 产物折叠 + 流畅动画 + 思考态视觉（plan）
status: archived
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-artifact-collapse.md"
areas: [web]
---

# 产物折叠 + 流畅动画（plan）

## 任务摘要
Collapsible 组件（grid-rows 动画）+ 折叠头/摘要行 + 跳转联动展开。思考态视觉由 Plan 2 流式预览承担（shimmer 经 review 砍掉）。

## 为什么做
长产物拉爆对话流；等待期只有 spinner。用户直接反馈"产物做成可折叠的，动画流畅点"。

## 预计效果
对话流长度可控约一半；等待期呈现 Claude 式"生成中"质感。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 动画方案 | 外层 `display:grid; grid-template-rows: 0fr↔1fr; transition` + 内层 overflow:hidden | max-height/max-height+JS 测高 | 内容高度自适应、无魔法数字、单属性过渡不掉帧 |
| 默认折叠阈值 | content.length>800 或 PaperCards 卡数>10 | 全展开 | 只有真正长的产物需要收敛 |
| 展开联动 | ChatFlow 维护 `expandRegistry: Map<stepId, ()=>void>`（ref 持有），ProgressRail/引用/文件 tab 调用 | Context/全局事件总线 | 三处调用方都在同树，ref 注册表最直接 |
| 摘要行 | 折叠态显示"约 N 字 · M 张卡片" | 纯标题 | 给展开预期 |
| ~~骨架~~ | ~~三行 shimmer~~（review 后砍掉：被 Plan 2 流式预览取代） | — | 省排期 |

## 实现步骤
1. `components/Collapsible.tsx`：受控组件（open, children, summary?），aria-expanded、chevron 旋转（transition-transform）、grid-rows 动画；
2. `ChatFlow.tsx`：StepBubble 产物卡 header 改造为折叠条（含摘要行）；默认折叠判定 `shouldCollapse(name, content)`；展开注册表暴露 `expandStep(stepId)`；
3. `ProgressRail.tsx` / `ArtifactFileTabs.tsx` / 引用 onCiteClick：跳转前 `expandStep`；
4. 运行中气泡无产物时的等待视觉由 Plan 2 流式预览承担（本 plan 不做骨架）；
5. 版本 tab / coverage matrix 区域随内容一起折叠（在 Collapsible 内部）。

## Review 发现与修正
（待独立 review 后回填）

## Review 发现与修正
- [minor]（跨 P2）运行态优先级未定义 → 修正：流缓冲非空 → 流式预览（P2）；空 → 现状。**shimmer 骨架砍掉**（被流式预览取代，省排期）。
- [nit] 版本 tab 在内容区外，折叠进去会藏住版本切换与结构对比 → 修正：只折叠 `p-4` 内容区 + coverage 段，版本 tab 行恒显。
- [✓] grid-rows 0fr↔1fr 目标浏览器（Chrome/Edge ≥107）可用；expandStep 展开注册表确属必要（引用跳转对 0fr 容器内元素确实失效）。

## 测试与验证
- Collapsible 单测（open 切换/aria/摘要行）；shouldCollapse 边界单测；
- CDP 截图两态：折叠/展开（运行中视觉随 Plan 2 验证）；
- 既有测试零回归（纯新增 + ChatFlow 少量改动）。

## 验收标准
- [ ] 动画无跳变（肉眼 + 无布局抖动）；
- [ ] 三类跳转必达；
- [ ] 长产物默认折叠且摘要可见；
- [ ] typecheck / test 全绿。
