---
title: 文档分类体系（博客五层 × 项目六分类映射）
status: active
created: 2026-08-06
updated: 2026-08-06
---

# 文档分类体系

> 出处：[Harness Engineering 实践分享](https://blog.xlab.app/p/c3ac2cfd/)「文档工程」章节。
> 原则：**一切需要被知道的知识都应该被文档化，只要有文档 Agent 就能干。**
> 像维护项目代码一样维护文档。

## 两层结构：内容维度 × 存放维度

博客的五层文档是**内容维度**（回答"这知识属于哪个面"）；本项目的六分类目录是**存放维度**（回答"放哪个文件夹"）。二者通过映射表关联，**不新建五层同名目录**，保持与 project-template 及 doc-contract/docs-scan 既有体系一致。

## 项目目录分类（存放维度，沿用 project-template）

```text
docs/
├── architecture/     # 架构：系统架构、数据模型、算法流程
├── specification/    # 规格：功能规格、需求、预期
├── guide/            # 指南：操作手册、流程规范、runbook
├── research/         # 调研：技术调研、竞品分析、探索记录
├── reference/        # 参考：bug case、测试记录、资料索引
├── decisions/        # 决策：ADR 式决策记录（含权衡）
├── issues/           # SDD 任务：要做什么（open/close）
└── plans/            # SDD 方案：怎么做（open/close）
```

## 博客五层 → 项目六分类映射

| 博客五层 | 内容 | 本项目存放 | 现状 |
|---------|------|-----------|------|
| **产品** | 功能设计、思考、决策权衡、预期 | `specification/` + `decisions/` | ✅ 已有（00-project-definition、01-competition-story） |
| **开发** | 架构、算法流程、数据关系 | `architecture/` | ⚠️ 待补（M1 时建） |
| **设计** | 设计风格、品味 | `guide/`（设计规范） | ❌ 待建（UI 定稿时） |
| **测试** | 测试文档、bug case 记录 | `reference/`（bug case）+ `guide/`（测试流程） | ❌ 待建（首个任务时） |
| **运维** | 环境运维手册 | `guide/`（runbook） | ❌ 待建（可先建最小版） |

> 任务类（issue/plan）是流程产物，独立成 `issues/`、`plans/` 目录，不属于五层。

## 与代码模块的关系（前端/后端怎么区分）

**文档按"知识主题"分，代码按"模块"分，二者正交。**

- 文档回答"为什么、是什么、怎么用"——放上述分类目录
- 代码回答"在哪里实现"——前端 web / 后端 server / 数据 data
- 文档与代码通过 frontmatter 的 `areas` 字段关联（`areas: [web, server]`），plan 完成后按 areas 圈定测试范围

## 本项目当前需要的最小文档集（起步阶段）

按"够用即可、随任务自然生长"原则（Harness 不是一次建成的，而是文档和工作流的自然迭代）：

1. `specification/` + `decisions/` — 产品文档 ✅ 已有（迁移或引用，不重复建）
2. `architecture/` — 系统架构、数据关系（M1 骨架时建）
3. `guide/runbook.md` — 本地运行手册（首个任务可运行后建）
4. `guide/` 设计规范、`reference/` 测试记录 — 相关任务出现时再建

> 不必一次建全：**哪个任务需要哪层文档，就在那个 plan 里加"更新对应文档"步骤**（博客的做法：plan 中自动更新文档机制 + 文档互相链接）。

## 文档维护规则

- 遵循 doc-contract：frontmatter 必填 `title / status / created / updated`
- 创建、修改、归档后同步更新 `docs/INDEX.md`
- 文档间互相链接（如 issue 引用 plan、plan 引用架构文档），模型更新时不易遗漏
- 归档不删除：issue/plan 移入 close/，状态置 archived
