---
name: doc-contract
description: >
  当用户需要创建、修改或归档文档，或者检查和修正文档的 frontmatter
  格式与状态时触发。适用场景：写新文档、更新内容、改 frontmatter、
  废弃/归档、恢复已归档文档。
  关键词：创建文档、写文档、新文档、记录、更新文档、修改文档、改文档、
  编辑、归档、废弃、不用了、过期、frontmatter、文档格式、文档状态、
  active、archived。
  当用户讨论整体文档架构（目录结构、INDEX.md 维护、文件归属判断）时
  应触发 project-doc-architecture skill；当需要全项目扫描文档结构时应
  触发 docs-scan skill。
---

# 文档契约（Doc Contract）

> 本 skill 管理**单个文档**的格式和生命周期（frontmatter、状态流转）。
> 整体文档架构（目录结构、INDEX.md 格式）由 `project-doc-architecture` skill 管理。
> 任务完成后的全项目文档扫描由 `docs-scan` skill 负责。
> 本 skill 的所有文件需通过 `read` 按需加载。

## 文件地图

- **[references/state-machine.md](references/state-machine.md)** — 文档生命周期的完整状态流转表和触发条件。需要判断文档状态或流转时读取。
- **[references/workflow.md](references/workflow.md)** — 日常工作流程：创建、修改、判断状态的具体操作步骤。准备动手操作文档时读取。
- **[gotchas.md](gotchas.md)** — 踩坑记录，常见错误和注意事项。遇到问题或准备操作前读取。
- **[.run-log.jsonl](.run-log.jsonl)** — Append-only 操作日志（见下方说明）。

### 必需结构自查

| 文件 | 状态 |
|------|------|
| ✔ SKILL.md | 本文件 |
| ✔ gotchas.md | G001-G005，含自迭代规则 |
| ✔ .run-log.jsonl | 已创建 |

## 职责边界

| 职责 | 所属 skill/subagent |
|------|-------------------|
| 单个文档的格式、状态流转 | **本 skill（doc-contract）** |
| 整体文档架构、目录结构、INDEX.md | project-doc-architecture |
| 全项目文档结构扫描 | docs-scan skill（手动触发） |

## 核心规则速览

### 文档格式（frontmatter 必填字段）

```yaml
title: 文档标题
status: active        # active | archived
created: 2026-06-01
updated: 2026-06-05
tags: [标签1, 标签2]
supersedes:           # 归档时填写被替代文档
```

### 状态流转速查（2 态）

```
   创建            归档
  ─────→  active  ─────→  archived
              ↑              │
              └──────────────┘
               恢复（reactivate）
```

| 从 | 到 | 条件 |
|----|----|------|
| _创建_ | active | 创建新文档时 |
| active | archived | 文档不再使用、被替代、过期 |
| archived | active | 已归档文档需要重新启用 |

> 详细规则见 [references/state-machine.md](references/state-machine.md)。

### 更新收尾清单

无论创建、修改、归档、恢复，做三件事：
1. 更新 `docs/INDEX.md`
2. 追加操作记录到 [.run-log.jsonl](.run-log.jsonl)（`write` 追加一行 JSON）
3. 向用户简要汇报当前文档状态概览

日志不注入 context。累计约 10 条后，主动询问用户是否需要总结为新的 gotcha。

---

## 最终原则

- 规则是为效率服务的，不是为遵守而遵守
- 如果某个规则在当前场景下不合理，可以跳过，但要在文档里注明原因
- 用户不需要记住这些规则——AI 在执行任务时自动遵循
