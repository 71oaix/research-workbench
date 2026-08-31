---
name: docs-scan
description: >
  当用户需要扫描项目文档结构、检查 frontmatter 完整性、清理 INDEX.md、
  整理 docs 目录、检查过期文档、或任务完成后做文档收尾时触发。
  支持显式命令 /skill:docs-scan，也支持自然语言触发。
  关键词：docs-scan、扫描文档、整理文档、文档检查、文档审计、
  文档结构、文档梳理、INDEX 清理、frontmatter 检查、收尾、文档收尾、
  扫一下文档。
  当用户仅仅是创建或修改单个文档（应触发 doc-contract）或决定文档
  目录结构（应触发 project-doc-architecture）时，不应触发本 skill。
---

# /docs-scan — 项目文档结构扫描与修复

> 任务完成后手动触发，全面梳理项目文档结构。
> 扫描范围：仅当前工作项目目录（`docs/` + 项目根目录）。
> 本 skill 的所有文件应通过 `read` 按需加载。

## 配置

```yaml
STALE_DAYS: 30     # 文档超过此天数未更新时标记为过期
DOC_DIR: docs      # 文档目录名
INDEX_FILE: docs/INDEX.md  # 索引文件路径
```

## 文件地图

| 文件 | 作用 | 读取时机 |
|------|------|---------|
| **本文件（SKILL.md）** | 路由 + 完整工作流 + 10 项检查清单 + 批量确认格式 | description 匹配后立即读取 |
| **[gotchas.md](gotchas.md)** | 高频踩坑记录 | 操作前或遇到问题时 |
| **[references/frontmatter-rules.md](references/frontmatter-rules.md)** | frontmatter 格式定义与自动生成规则 | 需要检查或修复 frontmatter 时 |
| **[references/index-rules.md](references/index-rules.md)** | INDEX.md 格式定义与一致性规则 | 需要检查或修复 INDEX.md 时 |
| **[references/directory-rules.md](references/directory-rules.md)** | 目录结构规范与迁移规则 | 需要判断文件归属或目录迁移时 |
| **[references/norm-audit.md](references/norm-audit.md)** | 规范执行审计：检查命名、INDEX 同步、单源 truth 等约定是否被执行 | 执行检查 #10 时 |

## 使用前提

- 当前工作目录是目标项目根目录
- `docs/` 目录存在（无 docs/ 则报 "无 docs 目录，跳过"）

## 完整工作流程

### 阶段〇：尺寸体检（新增）

在对文档内容进行扫描之前，先做一个快速尺寸检查：

```
① 遍历 docs/ 下所有 .md 文件
② 检查每个文件的行数和字节数
③ 标记异常：
   - 单文件超过 500 行 → ⚠️ 警告：该文档可能过于冗长，建议拆分
   - 单文件超过 50KB → 🔴 注意：超过 read 工具的截断阈值，LLM 只能看到前 50KB
   - 空文件 (0 字节) → 🔴 报告为破损文件（触发检查 #7）
```

### 阶段一：扫描（只读，收集问题）

```
① 收集文件清单
   └─ 遍历 docs/ 下所有 .md 文件（递归，排除 node_modules/ .git/）
   例：docs/architecture/sqlite-choice.md

② 读取 INDEX.md
   └─ 解析当前 INDEX.md 的所有条目：路径、状态
   例：| SQLite 选型 | active | docs/architecture/sqlite-choice.md |

③ 逐项检查（10 项，见下方清单）
   └─ 对每个文档运行全部 10 项检查
   例：file.md → 缺 frontmatter → 🟢 / 状态不合法 → 🟡
```

### 阶段二：分类

```
🟢 可自动修复（直接执行，不打断用户）：
  #1 缺失 frontmatter → 自动生成
  #3 孤儿文档 → 追加到 INDEX.md
  #4 幽灵条目 → 从 INDEX.md 删除

🟡 需用户确认（批量列出，一次性确认）：
  #2 status 值非法
  #5 旧状态目录迁移
  #6 过期文档归档
  #8 INDEX/frontmatter 不一致

🔴 仅报告（不自动处理，不询问）：
  #7 空文件/破损文档
  #9 交叉引用失效
```

### 阶段三：执行

```
① 自动修复（🟢）— 立即执行，不需要你确认
   生成一条日志记录每个操作

② 批量确认（🟡）— 收集所有 🟡 项，一次性展示；

     根据清单给出类似交互格式：
       🟡 需要确认以下 N 个操作：

       [1] <操作描述>
       [2] <操作描述>
       ...

       输入编号执行（如 1,2,3），或：
       "all" → 全部执行
       "skip N" → 跳过某编号
       "cancel" → 取消全部

③ 报告（🔴）— 列出所有发现的问题
   不修复，只报告
```

### 阶段四：输出报告

报告格式：

```markdown
## /docs-scan 报告
> 扫描时间：{YYYY-MM-DD HH:mm}
> 项目：{项目名}

### 总结
✅ 自动修复 {N} 项
🟡 用户确认 {N} 项（已处理 {N}）
🔴 发现问题 {N} 项（需手动处理）

### 自动修复记录
- docs/index.md → 已注册 2 个孤儿文档
- docs/guide/new-file.md → 已补 frontmatter
- docs/INDEX.md → 已删除幽灵条目 old-plan.md

### 用户确认记录
- [已执行] docs/active/api-design.md → docs/architecture/api-design.md
- [已跳过] docs/stable/user-guide.md → 归档

### 待处理问题
- docs/empty-file.md → 空文件
- docs/reference/ref.md → 链接指向 http://example.com/broken（404）
```

## 10 项检查清单

| # | 检查项 | 规则来源 | 修复策略 | 规则文件 | 说明 |
|---|--------|---------|---------|---------|------|
| 1 | frontmatter 缺失 | doc-contract | 🟢 自动修复 | references/frontmatter-rules.md | H1→title, status=active, date=today |
| 2 | status 值非法 | doc-contract | 🟡 用户确认 | references/frontmatter-rules.md | 不在 active/archived 中 |
| 3 | 孤儿文档 | project-doc-arch | 🟢 自动修复 | references/index-rules.md | 文件存在但 INDEX.md 无该行 |
| 4 | 幽灵条目 | project-doc-arch | 🟢 自动修复 | references/index-rules.md | INDEX.md 有行但文件不存在 |
| 5 | 旧状态目录 | project-doc-arch | 🟡 用户确认 | references/directory-rules.md | active/discuss/stable/ 等状态目录→主题目录 |
| 6 | 过期文档 | doc-contract | 🟡 用户确认 | references/frontmatter-rules.md | status=active 且 updated > {STALE_DAYS} 天 |
| 7 | 空文件/破损 | — | 🔴 仅报告 | — | 内容为空或无法解析 |
| 8 | INDEX/frontmatter 不一致 | project-doc-arch | 🟡 用户确认 | references/index-rules.md | 如 INDEX 分类与 frontmatter 标签不匹配 |
| 9 | 交叉引用失效 | doc-contract | 🔴 仅报告 | — | markdown 链接指向不存在的锚点/文件 |
| 10 | 规范执行审计 | project-doc-arch | 🔴 仅报告 | [references/norm-audit.md](references/norm-audit.md) | 命名规范、INDEX 同步、单源 truth、目录归属等约定是否被实际执行 |

## 关键规则速查

> 详细规则见 references/ 下对应文件。

### frontmatter 格式

```yaml
title: 文档标题
status: active        # active | archived
created: 2026-07-21
updated: 2026-07-21
tags: [标签1, 标签2]
```

### INDEX.md 格式

```markdown
| 文档 | 状态 | 路径 |
|------|:----:|------|
| v2 架构设计 | active | docs/architecture/v2-architecture.md |
```

### 推荐目录结构

```
docs/
├── INDEX.md
├── architecture/    # 系统架构、设计决策
├── specification/   # 技术规格、协议
├── guide/           # 开发指南、操作流程
├── research/        # 技术调研、方案对比
└── reference/       # 配置、端口、命令速查
```

## 自迭代规则

每次执行后，检查是否有以下情况：
- 某项检查误判了（false positive）→ 更新 gotchas.md
- 某项检查遗漏了（false negative）→ 更新检查清单
- 用户对交互格式有改进建议 → 更新 SKILL.md 工作流

如有新发现，询问用户是否需要记录到 gotchas.md 或调整规则。

## 收尾清单

每次执行完 /docs-scan 后，做两件事：
1. 追加扫描记录到 `.run-log.jsonl`（`write` 追加一行 JSON：`{"ts":"...","task":"docs-scan","success":true,"findings":[]}`）
2. 累计约 10 条后，询问用户是否需要总结为 gotcha
