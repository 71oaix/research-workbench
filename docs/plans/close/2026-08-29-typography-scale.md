---
title: 字阶与层级系统对齐 Claude（plan）
status: archived
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-typography-scale.md"
areas: [web]
depends_on:
  - "docs/plans/open/2026-08-29-layout-v3-resizable.md"
---

# 字阶与层级系统对齐 Claude（plan）

## 任务摘要
按字阶映射表全局 +1~2px；重点信息字重化（semibold/bold）；页面级标题衬线化；
卡片减负（边框减淡、圆角 +2px）。

## 为什么做
Claude 实测规格 Body 16/SM 14/Label 12 且衬线标题是身份核心；研镜整体小 2-3px、
层级靠颜色不靠字重（用户反馈"重点不突出"）。

## 预计效果
- 信息密度不变的前提下可读性提升一档；重点一眼可辨；编辑气质接近 Claude。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 标题衬线 | 系统衬线栈（Georgia/Songti，`--font-serif` 复用） | 引入 webfont | Claude 外部实现同样用 Georgia 回退；零加载成本 |
| 字重层级 | H1 600 / 步骤名 600 / 数字 700 / 按钮 600 / 正文 400 | 全局加粗 | 只加"角色重点"，避免整体变重 |
| 圆角 | token 层 +2px（一处改动全局生效） | 逐组件覆盖 | 所有组件引用 --radius 系 |
| 边框减淡 | line-soft #f0ede3 / line #e7e3d6 | 删边框改纯底色分层 | 保守渐变，避免结构感丢失 |
| 状态 pill | 保持 12px semibold 不变 | 跟随放大 | pill 已有底色强调，放大反而喧宾 |

## 实现步骤
1. `index.css`：radius token 8/12/16；line-soft/line 减淡；md-body 14.5 / md-doc 16；
   cite-tip 12；
2. `App.tsx`：H1 `font-serif text-[26px] font-semibold`；EmptyState H1 同规格、
   描述 15px、chips 12.5；meta 行 14px、数字 `font-bold`；启动按钮 14px；
3. `ChatFlow.tsx`：步骤名 15px、状态标签 12px、右侧 step.label 12px；
4. `WorkflowList.tsx`：条目 14px medium / meta 12px、搜索 13.5px、chips 12px
   （计数 11px）、区头 11.5px、弹层输入 15px、按钮 14px；
5. `ProgressRail.tsx` / `ArtifactFileTabs.tsx`：行文字 14px、状态 12px、区头 11.5px；
6. `ApprovalPanel.tsx`：标题 16px、说明 13px、textarea 14px、按钮 14px、决策 13px、
   时间 12px；
7. `PaperCards.tsx`：题名 14px semibold、meta 12px、摘要 13px、理由 12.5px。

## Review 发现与修正
- [minor] ChatFlow live 计数（命中/去重/下载）继承 12.5px，字阶表未覆盖 → 已并入实现：12.5→13px + font-bold。
- [minor] "所有组件引用 --radius 系"不实：存在硬编码圆角（rounded-[9px]/[8px]/[7px]/[14px]/[10px]）→ 修正：硬编码值同步 +2px（9→11、8→10、7→9、14→16、10→12），保持相对比例；--radius-sm 无引用，保持 6 不动。
- [minor] md 标题未随正文 +1，层级压缩到 +1px → 修正：md-body h1/h2/h3 = 18/16.5/15，md-doc h1/h2/h3 = 22/18.5/16.5。
- [minor] 验收"换底色后重算"超出范围（本轮只减淡边框，不改底色）→ 改为"ink3 现有底色复测 ≥4.5"。
- 现值审计全部准确；测试断言均为文本级，零改动假设成立。

## 测试与验证
- 全部现有测试应为文本断言零改动（跑一遍验证假设，若有 class 断言则同步）；
- 对比度复测：ink3 新底色组合 ≥4.5；
- CDP 前后截图对比（空态/详情/审批/草稿四场景）；
- typecheck / web test 全绿。

## 验收标准
- [ ] 字阶表逐项落地；衬线标题生效
- [ ] 对比度达标；测试零回归
- [ ] 截图前后对比确认观感提升
