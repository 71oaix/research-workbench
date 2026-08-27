---
title: 壳层布局、空态与可访问性（右栏收敛 / 响应式 / 对比度 / favicon / 死代码）
status: archived
created: 2026-08-28
updated: 2026-08-28
kind: accessibility
priority: medium
triage: needs-plan
areas: [web]
depends_on:
  - "docs/issues/open/2026-08-28-ui-design-review.md"
---

# 壳层布局、空态与可访问性

> 总纲：[2026-08-28-ui-design-review.md](2026-08-28-ui-design-review.md) 专项 5

## 背景

1. **空态右栏空转**：无工作流时三栏 grid（`App.tsx:38` 固定 `216px_1fr_276px`）仍渲染
   右栏"执行进度 / 产出文件"两个空区块（截图 ui-empty.png），276px 宽 + 全高只在底部
   一行提示，浪费且让首屏显得未完成；空态应聚焦创建动作本身；
2. **EmptyState 与新建 Modal 能力不对齐**：Modal 有示例问题 chips
   （`WorkflowList.tsx:83-92`），空态大输入框没有——两个同级入口体验不一致；
3. **响应式缺失**：固定三列在 <1280px 视口挤压中栏（演示投影仪 / 半屏场景常见）；
4. **对比度不达标（WCAG AA）**：实测 `ink3 #938d7c` on bg 2.98:1 / on surface 3.31:1
   （用于 10.5–12px 时间戳、区头标签、placeholder），`warn #9a6b1b` on warn-soft
   3.91:1（用于"该计划需要澄清" 12.5px 文本）——均为高频小字，硬伤；
5. **favicon 缺失**：`index.html` 未引用，浏览器标签是默认地球图标，观感廉价；
6. **死代码**：`StepTimeline.tsx` / `ArtifactTabs.tsx` / `EvidencePanel.tsx` 为 v1 布局
   遗留，全仓无引用（rg 证实），且 `lucide-react` 依赖仅被这三个文件引用——v2 已决策
   自绘 SVG，依赖应移除。

## 目标

壳层自适应、空态聚焦、色彩可达标、工程面干净。

## 范围（做）

- 空态（detail=null）时隐藏右栏，中栏占满，EmptyState 补示例 chips（复用 Modal 的
  示例数据源，抽公共常量）；
- 响应式：<1280px 时右栏收窄为 240px，<1080px 右栏折叠为可展开抽屉（简单实现：
  顶部工具条按钮开关，不做复杂手势）；
- token 调整：ink3 加深至对 bg/surface ≥4.5:1（如 #7a7462 系），warn 加深至对
  warn-soft ≥4.5:1；调整后全站目测回归（色感不变深发闷，必要时同步调 soft 底色）；
- favicon：自绘 SVG（墨绿圆角方 + 书页符，复用 IconBook 语言）导出 ico/svg 引入；
- 删除三个死组件文件 + `lucide-react` 依赖（package.json + lockfile）。

## 不做

- 不做移动端布局（<768px 明确提示"请使用桌面浏览器"即可，竞赛演示无移动场景）；
- 不做主题切换 / 暗色模式。

## 验收标准

- [ ] 空态首屏无右栏，输入框 + 示例 chips 聚焦主任务；
- [ ] 1280×800 与 1080p 投影分辨率下无横向滚动、无内容挤压；
- [ ] ink3 / warn 两组前景色对其实际底色对比度 ≥4.5:1（附计算值）；
- [ ] 标签页显示自定义 favicon；
- [ ] `rg lucide-react` 零命中，依赖移除后 install + typecheck + test 全绿。
