---
title: 目录结构规范（简化版）
source: project-doc-architecture
type: reference
---

# 目录结构规范

> 独立开发者场景：不维护多版本目录。用 git 管理版本，用 docs/ 管理文档。
> 主题域：5 个分类目录覆盖所有文档类型。

## 目录结构

```
<project-root>/
├── AGENTS.md              # 项目规则
├── README.md              # 项目说明
└── docs/                  # 所有设计文档
    ├── INDEX.md           # 文档索引
    ├── architecture/      # 系统架构、设计决策
    ├── specification/     # 技术规格、协议
    ├── guide/             # 开发指南、操作流程
    ├── research/          # 技术调研、方案对比、外部资料
    └── reference/         # 配置、端口号、命令速查
```

> 只有 `docs/INDEX.md` 是必需文件，分类目录按需创建。

## 内容归属

向 docs/ 加新文档时，按以下顺序判断放哪个目录：

```
这个文档讲的是什么？
  ├─ 系统怎么设计的？为什么这么设计？    → architecture/
  ├─ 接口/协议/数据格式的定义？          → specification/
  ├─ 怎么用？怎么操作？流程是什么？      → guide/
  ├─ 调研了哪些方案？为什么选 A 不选 B？  → research/
  └─ 端口号？命令？配置值？纯参考信息？   → reference/
```

**不确定时**：放 `guide/`，以后再移。

## 单源 truth

每个知识点只在一个文件中维护。引用用 Markdown 相对路径链接，不复制粘贴：

```markdown
详见 [架构设计](../architecture/v2-architecture.md)
```
