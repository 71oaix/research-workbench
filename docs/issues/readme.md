---
title: issues 目录规范（SDD 任务索引）
status: active
created: 2026-08-06
updated: 2026-08-06
---

# issues 目录规范

> 仿照 [Harness Engineering 实践](https://blog.xlab.app/p/c3ac2cfd/) 的轻量 SDD 模式。
> 每个任务一个 issue：**要做什么**（plan 回答怎么做）。

## 目录结构

```text
docs/
├── issues/
│   ├── readme.md          ← 本文件（规范索引）
│   ├── open/              ← 未完成任务（状态 open）
│   │   └── YYYY-MM-DD-简述.md
│   └── close/             ← 已完成任务（状态 archived，从 open 移入）
│       └── YYYY-MM-DD-简述.md
└── plans/
    ├── readme.md          ← plan 规范索引
    ├── open/              ← 已编写待审批/执行中的 plan
    └── close/             ← 已执行完成的 plan
```

## issue frontmatter（融合 doc-contract 与博客 SDD 字段）

```yaml
---
title: 任务标题
status: active            # active（open/）| archived（close/）
created: 2026-08-06
updated: 2026-08-06
kind: feature             # bug | feature | ux | performance | accessibility | security | tech-debt | docs | test | infra
priority: high            # urgent | high | medium | low | very-low | parked
triage: actionable        # actionable | planned | needs-plan | needs-design | needs-decision | blocked | parked | wontfix
areas: [docs, workflow]   # 影响范围（代码模块或文档域），plan 完成后按此圈定测试范围
resolution_plan: "docs/plans/open/2026-08-06-xxx.md"   # 可选：关联 plan 路径
depends_on:               # 可选：依赖的其他 issue
  - "docs/issues/open/2026-08-06-xxx.md"
---
```

> 说明：这是博客作者所说的"markdown metadata 语法"——即 YAML frontmatter，
> 他自己定义了 status/kind/priority/triage/areas/resolution_plan/depends_on 这套字段，
> 用文件夹（open/close）+ 文件名（日期+简述）管理状态流转，替代 GitHub issue 的标签系统。
> 本项目融合 doc-contract 必填字段（title/status/created/updated），两者兼容。

## 内容要求

- 一个 issue = 一个可验收的交付
- 简要描述：背景 → 目标 → 范围（含明确**不做**）→ 验收标准
- 详细方案写在对应的 `docs/plans/open/` 中，不在 issue 里展开
- 归档：任务完成后移动至 `close/`，`status` 改 `archived`，在 INDEX.md 中更新状态

## 流转

```text
提出 issue → 编写 plan → plan 独立 review → 人确认 plan
→ 实现 → 实现独立 review → 测试 → 人确认合并 → 归档（issue + plan 移入 close/）
```
