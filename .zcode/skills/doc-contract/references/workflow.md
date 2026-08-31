---
title: 日常工作流程（2 态简化版）
source: doc-contract
type: reference
---

# 日常工作流程

> 当需要动手操作文档（创建、修改、归档、恢复）时，按以下流程执行。
>
> **前提：** 触发判断已在 SKILL.md description（匹配关键词）和 gotchas G001（区分讨论 vs 执行意图）中完成。本文件只管「怎么做」。

## 创建新文档

### 创建步骤

```
① 用户确认「要记成文档」
  ↓
② 在 docs/ 下按主题分类创建 .md 文件
  （主题域：architecture/、specification/、guide/、research/、reference/）
  ↓
③ 填写 frontmatter（status: active）
  ↓
④ 写正文
  ↓
⑤ 更新 docs/INDEX.md
  ↓
⑥ 汇报：告知用户创建了什么文档
```

> frontmatter 格式见 SKILL.md 核心规则速览。

## 修改现有文档

### 修改步骤

```
① 读取用户要修改的文档
  ↓
② 修改内容
  ↓
③ 更新 frontmatter 中的 updated 日期
  ↓
④ 如果文档需要归档（不用了/被替代/过期），做归档流程
  ↓
⑤ 更新 docs/INDEX.md（如果有状态或内容变化）
  ↓
⑥ 汇报
```

## 归档文档

```
① 检查文档是否被替代
  ├─ 有替代文档 → 填写 supersedes: <替代路径>
  └─ 无替代文档 → supersedes 留空
  ↓
② 设置 status: archived
  ↓
③ 更新 updated 为今天
  ↓
④ 更新 INDEX.md
  ↓
⑤ 汇报：告知用户已归档（建议保留不删除）
```

## 恢复已归档文档

```
① 设置 status: active
  ↓
② 清除 supersedes 字段（如果有）
  ↓
③ 更新 updated 为今天
  ↓
④ 更新 INDEX.md
  ↓
⑤ 汇报：告知用户文档已恢复
```

## 判断文档当前状态

需要引用某个文档时：

```
① read(path, offset: 1, limit: 5) → 读取 frontmatter
  ↓
② 检查 status 字段
  ├─ active → 直接引用，内容有效
  └─ archived → 查看 supersedes：
       ├─ 有 → 引用 supersedes 指向的新文档
       └─ 无 → 告知用户内容仅供参考
```

## 文档操作收尾清单

每次动文档后，顺手做：

- [ ] 更新 docs/INDEX.md（增删改 + 状态变化）
- [ ] 向用户简要汇报当前文档状态概览
