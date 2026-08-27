---
title: UI 设计全量审查（设计师视角）：总纲与评分
status: active
created: 2026-08-28
updated: 2026-08-28
kind: ux
priority: high
triage: needs-plan
areas: [web]
---

# UI 设计全量审查（设计师视角）：总纲与评分

## 背景

以十年产品设计师视角（用户思维 + 产品意识）对 apps/web 做全量审查：
代码逐组件走读（App / ChatFlow / WorkflowList / ProgressRail / ArtifactFileTabs / ApprovalPanel /
PaperCards / MarkdownView / icons / index.css / store）+ 真实运行截图验证
（1600×900，Edge headless + CDP 点击导航，覆盖空态 / 完成态 / 审批暂停态 / 综述草稿）。

**总体判断**：设计方向是对的，执行是糙的。暖纸底 + 墨绿主色 + 纸纹噪点 + inset 高光的
"文献工作台"材质方向有辨识度、有品味（7.5/10）；token 体系（色板 / 圆角 / 阴影三层）已成
型；自绘 SVG 图标线性一致。但从产品完成度看，**排版体系、状态语义、核心卖点可视化**三块
执行不足，演示场景下会直接穿帮。综合 5.5/10。

## 评分卡

| 维度 | 分 | 一句话诊断 |
|------|----|-----------|
| 设计方向与品牌感 | 7.5 | 暖纸 + 墨绿 + 纸纹材质方向正确且独特，保住 |
| 排版与信息层级 | 4.0 | Markdown 标题无层级、表格零样式、`---` 字面渲染，产物没有"文档感" |
| 交互与状态设计 | 5.0 | 状态语义错误（paused 转 spinner）、中英混杂、引用 [n] 完全不可交互 |
| 信息架构 | 5.5 | 44 条工作流不可检索不可辨；空态下右栏整列空转 |
| 可访问性 | 4.5 | ink3 对比度 2.98:1（AA 需 4.5），warn 组合 3.91:1；无 favicon |
| 工程一致性 | 6.5 | token 化好；3 个 v1 死组件 + lucide-react 死依赖残留 |

## 必须保住的优点（后续改动不得破坏）

- 色彩 token 体系（index.css @theme）与三层阴影语言；
- 自绘 1.8 线宽 SVG 图标集的统一性；
- 按钮微交互（active:scale、inset 高光、focus ring ring-accent-soft）；
- 暖纸底 + 噪点 + 双 radial 光晕的氛围层。

## 专项 issue（实施顺序即优先顺序，按竞赛 demo 穿帮程度排序）

1. **状态语义与语言一致性**（quick win，含行为 bug）→
   [2026-08-28-status-semantics.md](2026-08-28-status-semantics.md)
2. **产物排版体系**（所有产物的阅读底座，表格硬伤）→
   [2026-08-28-artifact-typography.md](2026-08-28-artifact-typography.md)
3. **引用 [n] 可溯源交互**（核心卖点可视化，演示差异化）→
   [2026-08-28-citation-affordance.md](2026-08-28-citation-affordance.md)
4. **工作流列表信息架构**（44 条不可检索）→
   [2026-08-28-workflow-list-ia.md](2026-08-28-workflow-list-ia.md)
5. **壳层布局、空态与可访问性**（含死代码清理）→
   [2026-08-28-shell-layout-states.md](2026-08-28-shell-layout-states.md)

## 范围（不做）

- 不改后端流程 / 数据结构；不做移动端深度适配（沿用 v2 issue 决策）；
- 不引入组件库 / 图标库 / 新运行时依赖；不推翻现有色彩方向。

## 验收标准

- [ ] 5 个专项 issue 全部归档，综合评分复评 ≥7.5；
- [ ] 演示视频四大穿帮点（paused spinner、raw English、表格裸奔、引用无交互）全部消除；
- [ ] web typecheck / test 全绿，无新增运行时依赖。
