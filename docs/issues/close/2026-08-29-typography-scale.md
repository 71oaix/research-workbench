---
title: 字阶与层级系统对齐 Claude（typography scale）
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: ux
priority: high
triage: planned
areas: [web]
depends_on:
  - "docs/issues/open/2026-08-29-layout-v3-resizable.md"
---

# 字阶与层级系统对齐 Claude（typography scale）

## 背景

实测对标（designmd.run Claude primitives + open-design.ai token）：Claude 正文 16px /
SM 14 / Label 12，标题用衬线（Anthropic Serif，细字重 330-400）承担编辑气质；
研镜正文 13.5 / SM 12 / Label 10.5，全局小 2-3px；层级靠颜色深浅而非常用字重，
"重点不突出"（用户反馈）。

## 目标

全局字阶 +1~2px 对齐 Claude 规格档位；建立"字重层级"体系（重点 semibold/bold）；
页面级标题启用衬线；卡片视觉减负（边框减淡、圆角 +2px）。

## 字阶映射（实现对照表）

| 角色 | 现值 | 新值 | 字重 |
|---|---|---|---|
| 空态 H1 / 工作流标题 | 22-23px sans bold | **26px 衬线 semibold** | 600 |
| 步骤名（气泡头） | 14 semibold | **15 semibold** | 600 |
| 正文 md-body / doc 模式 | 13.5 / 14.5 | **14.5 / 16** | 400 |
| 列表条目 / 按钮文字 | 13 | **14** | medium / semibold |
| 次级说明 / meta | 11-12 | **12** | 400 |
| 区头小标签 | 10.5 | **11.5** | bold |
| 关键数字（命中/步骤/产物数） | 13 semibold | **14 bold** | 700 |
| 状态 pill | 12 semibold | 12 semibold（不变） | 600 |

## 范围（做）

- App / ChatFlow / WorkflowList / ProgressRail / ArtifactFileTabs / ApprovalPanel /
  PaperCards / EmptyState 按上表逐项调整；工作流 goal 标题与空态 H1 加 `font-serif`；
- index.css：--radius 6/10/14 → **8/12/16**；line-soft/line 各减淡一档
  （#ece8dc→#f0ede3、#e3dfd2→#e7e3d6）；md-body 13.5→14.5、md-doc 14.5→16；
- cite-tip 11.5→12；引用上标 11→12。

## 不做

- 不换字体文件（衬线用系统 Georgia/Songti 栈，同 Claude 的 Georgia 回退策略）；
- 不改主色；不做暗色模式；不改交互结构。

## 验收标准

- [ ] 字阶表逐项截图核对；标题为衬线且层级清晰；
- [ ] 重点信息（步骤名、关键数字、按钮）字重可感知；
- [ ] ink3/warn 组合对比度复测 ≥4.5:1（换底色后重算）；
- [ ] 现有测试无回归（纯 class 变更，断言均为文本级，预计零改动）；
- [ ] typecheck / test 全绿。
