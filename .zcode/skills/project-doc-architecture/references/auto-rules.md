---
title: 自动化规则（2 态对齐版）
source: project-doc-architecture
type: reference
---

# 自动化规则

## 规则 1：创建新文档时自动生成模板

当 AI 判断「需要写成文档」时，自动生成：

```markdown
---
title: 文档标题
status: active
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
---

# 文档标题

## 背景

（为什么要做）

## 方案

（怎么做）

## 关键决策

| 时间 | 决定 | 理由 |
|------|------|------|

## 已排除

| 方案 | 排除理由 |
|------|---------|
```

## 规则 2：操作后检查 INDEX.md 一致性

每次创建、移动、归档、恢复文档后，自动检查：

1. 新文档是否已在 INDEX.md 中？
2. 已操作文档的 INDEX.md 路径和状态是否正确？
3. 是否存在 docs/ 里有但 INDEX.md 里没有的（孤儿文档）？
4. 是否存在 INDEX.md 里有但文件不存在的（幽灵条目）？

发现不一致 → 自动修正，告知用户。

## 规则 3：批量操作先列清单

需要批量创建/移动/归档时，先列出操作计划给用户确认：

```
检测到以下不一致：
1. docs/architecture/old-design.md → status 改为 archived
2. docs/research/new-idea.md → 不在 INDEX.md 中
3. INDEX.md 中的 removed-file.md → 文件不存在（幽灵条目）

建议操作：
① 更新 old-design.md 的 status 为 archived
② 将 new-idea.md 加入 INDEX.md
③ 从 INDEX.md 删除 removed-file.md

可以吗？
```
