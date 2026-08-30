---
title: Frontmatter 规则与自动生成
source: docs-scan
type: reference
---

# Frontmatter 规则

> 与 doc-contract skill 保持一致。本文件定义 /docs-scan 在扫描时使用的 frontmatter 规则。

## 合法字段

| 字段 | 必填 | 合法值 | 说明 |
|------|------|--------|------|
| title | 是 | 任意字符串 | 文档标题。缺失时从第一个 H1 推断 |
| status | 是 | active / archived | 文档生命周期状态 |
| created | 是 | YYYY-MM-DD | 创建日期 |
| updated | 是 | YYYY-MM-DD | 最后更新日期 |
| tags | 否 | [标签1, 标签2] | 分类标签。从 INDEX.md 对应行反推 |
| supersedes | 否 | 文件名 | 被替代的文件（status=archived 时常用） |

## 检查 #1：frontmatter 缺失 → 🟢 自动修复

文件内容不以 `---` 开头 → 缺少 frontmatter。

**自动生成规则：**
- `title`：从文件内容中第一个 `# H1标题` 提取
- `status`：默认 `active`
- `created`：填今天 `YYYY-MM-DD`
- `updated`：填今天 `YYYY-MM-DD`
- `tags`：空 `[]`

## 检查 #2：status 值非法 → 🟡 用户确认

status 字段的值不在 `active / archived` 中。

**不自动修复，列出给用户选择：**
```
文件：docs/example.md
当前 status：superseded（不合法）
建议：改为 "archived"
```

## 检查 #6：过期文档 → 🟡 用户确认

同时满足：
1. `status: active`
2. `updated` 字段距今超过 `STALE_DAYS`（默认 30）天

**建议用户考虑归档：**
```
文件：docs/architecture/old-design.md
最后更新：2026-06-15（已过 {N} 天）
建议：考虑归档（status 改为 archived）
```

## 自动生成 frontmatter 的完整逻辑

```markdown
# 输入文件内容（无 frontmatter）：

## useQuery 用法

useQuery 是 TanStack Query 的核心 hook...

# 自动生成：

---
title: useQuery 用法
status: active
created: 2026-07-21
updated: 2026-07-21
tags: []
---

## useQuery 用法

useQuery 是 TanStack Query 的核心 hook...
```
