---
title: 索引维护规则（2 态对齐版）
source: project-doc-architecture
type: reference
---

# 索引维护规则

## INDEX.md 格式

```markdown
| 文档 | 状态 | 路径 |
|------|:----:|------|
| v2 架构设计 | active | docs/architecture/v2-architecture.md |
| SQLite 选型 | active | docs/research/sqlite-choice.md |
| 旧版架构 | archived | docs/architecture/v1-architecture.md |
```

| 列 | 内容 | 示例 |
|----|------|------|
| 文档 | 文档标题（与 frontmatter title 一致） | v2 架构设计 |
| 状态 | active 或 archived（与 frontmatter status 一致） | active |
| 路径 | 相对于项目根目录的路径 | docs/architecture/v2-architecture.md |

## 维护规则

### 每次操作后同步 INDEX.md

创建 / 修改 / 归档 / 恢复文档后，必须检查 INDEX.md：

1. **新文档** → 追加一行到 INDEX.md 对应分类下
2. **状态变化** → 更新 INDEX.md 的状态列
3. **标题变化** → 更新 INDEX.md 的文档列
4. **归档** → 状态改为 archived，不移除行（保留历史）

### 交叉引用

- 用相对路径 Markdown 链接
- 不允许复制粘贴其他文档的内容

## 文档状态

| 状态 | 含义 |
|------|------|
| active | 当前启用的文档 |
| archived | 已归档（不再使用但有参考价值） |

状态流转由 doc-contract skill 管理。
