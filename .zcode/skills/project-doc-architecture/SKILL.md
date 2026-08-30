---
name: project-doc-architecture
description: >
  当用户需要创建项目目录、组织文档结构、判断文档放哪个目录、
  维护 INDEX.md 索引、或清理重复文档时触发。
  关键词：目录结构、文档放哪、INDEX.md、文档索引、建目录、
  文档组织、文档归属、重复文档、文件结构、doc架构。
  当涉及单个文档的格式/状态/创建/归档时应触发 doc-contract 而非本 skill。
---

# 项目文档架构管理

> 本 skill 管理**项目级**的文档架构（目录结构、命名规范、索引维护）。
> 个体文档的生命周期管理由 `doc-contract` skill 负责。
> 全项目文档扫描由 `docs-scan` skill 负责（任务完成后手动触发）。

## 文件地图

### 必需文件

| 文件 | 作用 | 读取时机 |
|------|------|---------|
| **本文件（SKILL.md）** | 路由入口 + 核心概念 | description 匹配后立即读取 |
| **[gotchas.md](gotchas.md)** | 高频踩坑记录 | 操作前或遇到问题时 |
| **[.run-log.jsonl](.run-log.jsonl)** | Append-only 操作日志 | 不注入 context；累计后总结为 gotcha |

### 参考文件（按需读取）

| 文件 | 作用 | 读取时机 |
|------|------|---------|
| **[references/directory-structure.md](references/directory-structure.md)** | 推荐目录结构 + 内容归属判断 | 创建项目目录或添加新文档时 |
| **[references/conventions.md](references/conventions.md)** | 单源 truth 原则 + 命名规范 + 创建文档决策树 | 判断文档归属或命名时 |
| **[references/index-maintenance.md](references/index-maintenance.md)** | INDEX.md 维护规则 + 交叉引用规则 | 写/改文档后检查 INDEX.md 时 |
| **[references/auto-rules.md](references/auto-rules.md)** | 自动化规则：模板生成、INDEX 一致性检查、批量操作清单 | 需要自动生成模板或批量操作时 |

## 职责边界

| 职责 | 所属 skill/subagent |
|------|-------------------|
| 整体文档架构、目录结构、命名规范 | **本 skill（project-doc-architecture）** |
| 个体文档的格式、状态流转 | doc-contract |
| 全项目文档结构扫描 | docs-scan skill（手动触发） |

## 核心原则速查

**单源 truth：** 每个知识点只在一个文件中维护。引用用 Markdown 链接，不复制粘贴。

**目录结构：**
```
docs/                    # 设计文档（按主题分类）
├── INDEX.md
├── architecture/
├── specification/
├── guide/
├── research/
└── reference/
```

**INDEX.md 格式：**
```markdown
| 文档 | 状态 | 路径 |
|------|:----:|------|
```

**文档状态：** active | archived（由 doc-contract 管理）

> 详细规则见 references/ 下对应文件。

## 配合其他 skill

| Skill | 分工 |
|-------|------|
| **doc-contract** | 个体文档的生命周期（流转条件、frontmatter 格式） |
| **project-doc-architecture（本 skill）** | 整体文档架构 + 自动化规则 |
| **经验库**（~/.pi/agent/experiences/） | 具体操作坑的记录 |

## 收尾清单

每次操作用完本 skill 后，做三件事：
1. 更新 `docs/INDEX.md`（如有增删改）
2. 追加操作记录到 [.run-log.jsonl](.run-log.jsonl)（`write` 追加一行 JSON：`{"ts":"...","task":"...","success":true,"findings":[]}`）
3. 向用户简要汇报操作结果

日志不注入 context。累计约 10 条后，主动询问用户是否需要总结为新的 gotcha。
