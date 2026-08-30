---
title: 约定规范（简化版）
source: project-doc-architecture
type: reference
---

# 约定规范

## 命名规则

```
docs/<分类>/<英文短名>.md

例：docs/architecture/v2-architecture.md
   docs/research/sqlite-choice.md
```

- 文件名全英文小写，连字符分隔
- 不含日期（日期在 frontmatter）
- 不含作者

## 创建文档的决策流

```
要写一个新文档
  ↓
先搜索 docs/INDEX.md + 已有文档 → 已存在？
  ├─ 是 → 更新已有文档，不新建
  └─ 否 → 按内容归属放对应目录：
       ├─ 架构设计      → docs/architecture/
       ├─ 技术规格      → docs/specification/
       ├─ 操作指南      → docs/guide/
       ├─ 调研对比      → docs/research/
       └─ 配置参考      → docs/reference/
```

## 引用规则

- 用 Markdown 相对路径链接，不复制粘贴
- 禁止两个文档说同一件事

## 跨文件一致性

每次创建/修改/归档/恢复文档后：
- 必须同步更新 `docs/INDEX.md`（路径、状态）
- 如果文档标题变了，INDEX.md 的「文档」列也要更新
