---
title: 规范执行审计（检查 #10）
source: docs-scan
type: reference
---

# 规范执行审计

> 启发自 neat-freak 的「规则→实践核对」模式。
> 不只检查格式（frontmatter 有没有写对），而是检查**规则有没有被实际执行**。

## 审计项

### 1. 命名规范执行

检查 docs/ 下所有 .md 文件：
- 文件名是不是全英文小写？
- 是不是用了连字符而非下划线/空格/中文？
- 有没有包含日期（日期应该在 frontmatter）？

```
例：
✅ architecture/v2-architecture.md
❌ architecture/V2-ARCHITECTURE.md
❌ architecture/架构设计.md
❌ architecture/2024-07-01-architecture.md
```

### 2. INDEX.md 同步

检查 INDEX.md 是否反映了真实的文档状态：

| 检查项 | 方法 |
|--------|------|
| 有新增文件但 INDEX 没加？ | `find docs/ -name "*.md"` vs INDEX 行 |
| 有归档文件但 INDEX 状态没改？ | INDEX status 列 vs frontmatter status |
| INDEX 引用的路径还存在吗？ | INDEX 路径列 vs 实际文件系统 |

### 3. 单源 truth

搜索 docs/ 下是否存在**两个文件说同一件事**：

- 搜索重复的 frontmatter title
- 搜索重复出现的核心术语/概念名（可能被复制粘贴）
- 发现时标记："疑似重复内容，建议核实并整合"

### 4. 目录归属

检查每个文档是否放在了正确的主题目录下：

| 文档内容 | 应该在哪 |
|---------|---------|
| 架构描述、设计决策 | architecture/ |
| 接口定义、协议说明 | specification/ |
| 教程、操作步骤 | guide/ |
| 选型分析、方案对比 | research/ |
| 端口号、配置表 | reference/ |

误放的建议迁移。

### 5. Frontmatter 一致性

不是检查缺失（那是 #1），而是检查**不一致的习惯**：

- 有的文档用 `tags: [A, B]` 有的用 `tags: A, B`（格式不统一）
- 日期格式是否都是 `YYYY-MM-DD`
- `supersedes` 字段引用的文件是否存在

## 输出格式

```
## 🔍 规范执行审计

### 命名规范
- ✅ 所有文件名符合规范
（或）
- ❌ 3 个文件命名不规范：
  - docs/architecture/V2-ARCHITECTURE.md → 建议改为 v2-architecture.md

### INDEX 同步
- ✅ INDEX.md 与实际文件一致
（或）
- ⚠️ 2 个孤儿文档未注册
- ⚠️ 1 个幽灵条目

### 单源 truth
- ⚠️ "布局系统"在 3 个文档中重复出现，建议整合
```
