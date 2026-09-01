---
title: 目录结构规范与迁移规则
source: docs-scan
type: reference
---

# 目录结构规则

> 与 project-doc-architecture skill 保持一致。本文件定义 /docs-scan 在扫描时使用的目录规则。

## 推荐目录结构

```
docs/
├── INDEX.md              # 文档索引（必需）
├── architecture/         # 系统架构、设计决策
├── specification/        # 技术规格、协议
├── guide/                # 开发指南、操作流程
├── research/             # 技术调研、方案对比
└── reference/            # 配置、端口、命令速查
```

## 检查 #5：旧状态目录 → 🟡 用户确认

检测到 docs/ 下存在以下**旧的状态目录**之一：

| 旧目录 | 说明 |
|--------|------|
| `docs/active/` | 旧：活跃文档目录 |
| `docs/discuss/` | 旧：讨论中文档目录 |
| `docs/stable/` | 旧：稳定文档目录 |
| `docs/demand/` | 旧：需求文档目录 |
| `docs/draft/` | 旧：草稿目录 |

### 迁移建议

按文档内容类型映射到新目录：

| 内容类型 | 原可能在 | 建议迁移到 |
|---------|---------|-----------|
| 架构设计类 | active/、stable/ | docs/architecture/ |
| 技术规格类 | active/、stable/ | docs/specification/ |
| 操作指南类 | active/、stable/ | docs/guide/ |
| 调研/方案对比 | discuss/ | docs/research/ |
| 配置/参考 | active/、stable/ | docs/reference/ |

当文件无法明确判定归属时，建议：
1. 读取文件 frontmatter 的 `tags` 字段辅助判断
2. 读取文件第一个 H1 标题辅助判断
3. 如果仍不确定 → 放在 `docs/guide/` 作为兜底

不动 `archived/` 和 `_archive/` 目录——已归档文件不迁移。

## 迁移后工作

1. 重建 INDEX.md：所有路径更新为新目录
2. 验证所有路径可达
3. 确认旧目录中无残留文件
