---
title: INDEX.md 规则与一致性检查
source: docs-scan
type: reference
---

# INDEX.md 规则

> 与 project-doc-architecture skill 保持一致。本文件定义 /docs-scan 在扫描时使用的 INDEX.md 规则。

## INDEX.md 标准格式

```markdown
| 文档 | 状态 | 路径 |
|------|:----:|------|
| v2 架构设计 | active | docs/architecture/v2-architecture.md |
| 旧版架构 | archived | docs/architecture/v1-architecture.md |
```

### 列说明

| 列 | 内容 | 示例 |
|----|------|------|
| 文档 | 文档标题（应与 frontmatter title 一致） | v2 架构设计 |
| 状态 | status（应与 frontmatter status 一致） | active |
| 路径 | 相对于项目根目录的路径 | docs/architecture/v2-architecture.md |

## 检查 #3：孤儿文档 → 🟢 自动修复

文件存在于 `docs/` 目录下，但 INDEX.md 中没有对应行。

**自动修复规则：**
- 读取文件的 frontmatter title（或从 H1 推断）
- 读取 frontmatter status（或默认为 active）
- 在 INDEX.md 末尾对应分类下新增一行

## 检查 #4：幽灵条目 → 🟢 自动修复

INDEX.md 中某行的 `路径` 列指向的文件**不存在**。

**自动修复规则：**
- 直接从 INDEX.md 删除该行
- 记录操作日志

## 检查 #8：INDEX/frontmatter 不一致 → 🟡 用户确认

### 8a：文档标题不一致
INDEX.md 的「文档」列与文件 frontmatter 的 `title` 字段不一致。

```
INDEX.md 写：设计文档
frontmatter 写：原始设计
→ 建议统一为 frontmatter 的值
```

### 8b：状态不一致
INDEX.md 的「状态」列与文件 frontmatter 的 `status` 字段不一致。

```
INDEX.md 写：stable
frontmatter 写：active
→ 建议统一为 frontmatter 的值
```

**不自动修复，列出差异给用户确认。建议以 frontmatter 为准（前端），修复 INDEX.md。**

## 执行建议

修复顺序：先处理 #4（幽灵条目）→ #3（孤儿文档）→ #8（不一致），避免索引在中间步骤混乱。
