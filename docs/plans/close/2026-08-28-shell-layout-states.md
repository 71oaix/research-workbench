---
title: 壳层布局、空态与可访问性（plan）
status: archived
created: 2026-08-28
updated: 2026-08-28
issue: "docs/issues/close/2026-08-28-shell-layout-states.md"
areas: [web]
---

# 壳层布局、空态与可访问性（plan）

## 任务摘要
空态收敛为两栏聚焦创建；响应式两档（<1280 右栏收窄 / <1080 右栏折叠为抽屉）；
ink3/warn 色对比度达 WCAG AA；新增 favicon；删除 3 个 v1 死组件与 lucide-react 依赖。

## 为什么做
空态下右栏 276px 空转（截图实证）稀释首屏；固定三列 <1280 挤压中栏；ink3 实测对比度
2.98:1（AA 需 4.5）、warn 组合 3.91:1；favicon 缺失观感廉价；StepTimeline/ArtifactTabs/
EvidencePanel 三个 v1 组件全仓无引用且 lucide-react 仅被它们引用。

## 预计效果
- 首屏聚焦"开始一次调研"；窄视口不挤压；色板全量可达标；标签页有品牌 favicon。

## Review 发现与修正
- [major] ArtifactTabs 内含已发布的 StructureDiff 能力（章节+引用编号版本对比，M2-11 交付，有专属测试）→ 修正：将 StructureDiff 及 headings/refs 助手移植为独立组件 components/StructureDiff.tsx，挂载到 ChatFlow 版本 tab 行（多版本时显示"结构对比"开关按钮）；测试随迁为 StructureDiff.test.tsx。
- [minor] 断点口径不一致（1080 vs Tailwind lg=1024）→ 修正：@theme 覆盖 --breakpoint-lg: 1080px，文案与实现统一为 1080。
- [minor] 对比度预估值与实测有偏差 → 修正：实现后以 python 实测为准记录（预估 ink3 新值 4.94/5.49、warn 新值 5.61，均 ≥4.5，方向不变）。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 空态布局 | detail=null 时不渲染 aside，grid 变两栏 | 右栏显示引导内容 | 引导已在中栏 EmptyState，右栏重复只会稀释 |
| 响应式 | Tailwind 断点：<xl(1280) 右栏 240px，<lg(1080) 右栏折叠为抽屉 + 头部按钮开关 | 完全重排 | 实现简单、覆盖演示场景（投影 1280、半屏） |
| ink3 调深 | #938d7c → #6e6959（实测对 bg/surface ≥4.9:1） | #5f5a4d(ink2) | 保持层级差的同时达标 |
| warn 调深 | #9a6b1b → #7c5413（实测对 warn-soft 5.6:1） | 只调 warn-soft 底色 | 单变量改动，色相不变 |
| StructureDiff | 移植保留 | 随死代码删除 | 已发布能力不静默回退（review 发现） |
| favicon | 手写 SVG（墨绿圆角方 + 白描书页，呼应 IconBook） | ico 位图转换 | 矢量清晰、免构建工具 |
| 死代码 | 删 3 组件 + ArtifactTabs.test.tsx（StructureDiff 测试移出）+ npm 移除 lucide-react | 保留备用 | v2 已决策自绘图标；git 历史可找回 |

## 实现步骤
1. `App.tsx`：grid 类按 detail 条件化；<lg 抽屉开关按钮 + aside 容器类（fixed/right-0
   z-40 w-[276px] shadow-lift，lg 以上回归静态列）；EmptyState 补示例 chips；
2. 新建 `apps/web/src/lib/examples.ts`：示例问题常量，EmptyState 与 WorkflowList 弹层共用；
3. `index.css`：--color-ink3 / --color-warn 调值；
4. `apps/web/public/favicon.svg` 新建 + index.html `<link rel="icon">`；
5. 移植 StructureDiff → components/StructureDiff.tsx；删除 StepTimeline.tsx / ArtifactTabs.tsx / EvidencePanel.tsx / test/ArtifactTabs.test.tsx（StructureDiff 测试另立）；
6. `apps/web/package.json` 移除 lucide-react，根目录 `npm install` 刷新 lockfile。

## 测试与验证
- 色彩：python 计算 ratio(ink3,bg)/ratio(ink3,surface)/ratio(warn,warn-soft) ≥4.5 并记录；
- `test/App.test.tsx`：空态无"产出文件"区头、含示例 chips；detail 态含右栏；
- typecheck + web test 全绿；`rg lucide-react` 全仓零命中；
- CDP 截图复验空态两栏与 1280 视口。

## 验收标准
- [ ] 空态首屏无右栏，含示例 chips
- [ ] 1280×800 无横向滚动、中栏不挤压；<1080 右栏可展开收起
- [ ] 三组对比度 ≥4.5:1（附数值）
- [ ] 标签页显示 favicon
- [ ] lucide-react 移除，install/typecheck/test 全绿
