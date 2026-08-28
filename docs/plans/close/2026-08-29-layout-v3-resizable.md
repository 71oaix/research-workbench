---
title: 三栏可拖拽自适应布局（plan）
status: archived
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-layout-v3-resizable.md"
areas: [web]
---

# 三栏可拖拽自适应布局（plan）

## 任务摘要
左 260 / 右 276 / 中 780 默认值 + 栏间拖拽调宽（持久化、双击重置、键盘微调）+ 左栏间距重排。

## 为什么做
216px 七层堆叠拥挤（用户反馈），宽度固定不可调，大屏中栏偏窄。

## 预计效果
- 左栏呼吸感明显改善；用户可按屏幕/偏好自定三栏比例，偏好持久。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 宽度应用方式 | CSS 变量 + Tailwind 任意值 `grid-cols-[var(--rw-left)_6px_minmax(0,1fr)...]` | 内联 style 拼 grid-template | 保留响应式断点能力（<1080 不留右列） |
| 拖拽实现 | 原生 pointer capture + setState（增量模式：move 里更新 startX） | rAF 节流 / pointerlock | 增量模式天然低频，代码最少 |
| 分隔线结构 | 独立 grid 子项（6px 列） | main 内绝对定位 | 语义清晰、不遮挡内容 |
| 持久化 | localStorage JSON {left,right}，解析失败回退默认 | 每列两个 key | 单 key 原子读写 |
| 重置交互 | 双击分隔线 | 设置面板 | 零 UI 成本 |
| 键盘支持 | role=separator + ←/→ ±16px | 无 | a11y（用户群体含投影/外接键盘场景） |

## 实现步骤
1. `apps/web/src/lib/layout.ts`：`DEFAULT_LEFT=260 / DEFAULT_RIGHT=276 / MIN=220 / MAX=360`、
   `clampColWidth(w)`、`loadLayout()`（try/catch + 数值校验）、`saveLayout(l)`；
2. `apps/web/src/components/ColumnDivider.tsx`：pointer capture 拖拽 + 双击 + 键盘，
   视觉 1px 线 hover 变 accent，实际热区 6px 列；
3. `App.tsx`：leftW/rightW state（惰性初始化读 localStorage）→ 注入 CSS 变量；
   grid 模板 detail = `[var(--rw-left)_6px_minmax(0,1fr)] lg:..._6px_var(--rw-right)]`，
   empty = `[var(--rw-left)_minmax(0,1fr)]`；左 divider 恒显，右 divider `hidden lg:block`；
   中栏 720→780；effect 持久化 leftW/rightW；
4. 左栏间距重排（WorkflowList）：logo pb-4→pb-5、搜索 mt-3→mt-4、chips mt-2→mt-3、
   区头 mb-2→mb-3、条目 py-2→py-2.5 leading-[1.5]；
5. 抽屉模式确认不受影响（aside fixed 于 <lg，右 divider 隐藏）。

## Review 发现与修正
- [major] 空态模板 `[var(--rw-left)_minmax(0,1fr)]` 与"左 divider 恒显"矛盾——auto-placement 会把 divider 排进 1fr 列挤破空屏 → 修正：空态模板同为 `[var(--rw-left)_6px_minmax(0,1fr)]`（divider 恒渲染）。
- [minor] var 注入失败会导致整条 grid-template 失效 → 修正：CSS 变量带回退 `var(--rw-left,260px)`。
- [minor] 默认右栏 276 在 1080–1280 段把主栏压到 ~532px（现状 624）→ 修正：默认右栏 260，接受该区间"略窄、可拖拽拉回"的取舍。
- [minor] 两侧 clamp 范围应不对称（左 220–340 / 右 220–360）→ 修正：clampColWidth 带 min/max 参数。
- [minor] 缺 touch-action:none 与 pointercancel 处理 → 修正：divider 加 `touch-none`、pointercancel 释放；setPointerCapture 包 try/catch（jsdom 兼容）。
- [minor] 720→780 共三处（错误框/头部/ChatFlow），已补全枚举。
- [nit] INDEX 漏登两行、issue: 字段规范为裸文件名 → 归档时统一修正。

## 测试与验证
- 新增 `test/layout.test.ts`：clamp 边界（220/260/360）、loadLayout 损坏 JSON/越界回退、
  save→load roundtrip；
- App.test 不受影响（无 grid class 断言）；
- CDP 截图：默认宽、拖拽后宽、<1080 无右 divider；
- typecheck / web test 全绿。

## 验收标准
- [ ] 拖拽/双击/键盘三交互可用，宽度刷新保留
- [ ] <1080 布局与抽屉行为不回归
- [ ] 单测覆盖纯函数；全绿
