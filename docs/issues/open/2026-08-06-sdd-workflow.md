---
title: 在 research-workbench 建立轻量 SDD 工作流并启动首个开发循环
status: active
created: 2026-08-06
updated: 2026-08-06
kind: infra
priority: high
triage: actionable
areas: [docs, workflow, project-setup]
---

# 在 research-workbench 建立轻量 SDD 工作流并启动首个开发循环

## 背景

research-workbench（研镜）已完成设计阶段（技术栈定稿、MVP 基线确定、文档体系初建），即将进入开发阶段。当前开发缺乏**系统化任务流程**：没有明确的 issue/plan 两层文档驱动，也没有 plan review、实现 review、测试验证的质量保障环节，属于"随意开发"状态。

参照 [Harness Engineering 实践分享](https://blog.xlab.app/p/c3ac2cfd/)（ttttmr）的方法论，结合本项目已有的 [doc-maintenance](https://github.com/ttttmr) 文档规范体系，为 research-workbench 建立一套**轻量、本地化、可执行**的 SDD（Spec-Driven Development）工作流，并以此流程驱动首个实际开发任务，跑通闭环。

## 目标

1. **建立 SDD 基础设施**（已完成）：
   - `docs/issues/`（open/close + readme + frontmatter 规范）
   - `docs/plans/`（open/close + readme + frontmatter 规范）
   - 与现有 doc-contract（frontmatter 必填 `title/status/created/updated`、INDEX.md 同步）保持一致
2. **建立五层文档体系**（见 [文档分类体系](docs/guide/02-document-taxonomy.md)）：
   - 产品/开发/设计/测试/运维五层 + 任务类，映射到本项目实际目录
   - 起步只建最小文档集：开发架构、数据关系、运维 runbook，其余随任务自然生长
3. **定义开发循环**：提出 issue → 编写 plan → plan 独立 review → 人确认 plan → 实现 → 实现独立 review → 测试 → 人确认合并 → 归档
4. **启动首个开发任务**：用新流程跑通一个真实的 MVP 起步任务（如项目骨架初始化：monorepo 目录、前后端脚手架、SQLite 接入、CI 基础）
5. **质量保障落地**：首个任务即包含 plan review 与实现 review 的实践、以及基础测试（哪怕是最小验证）
6. **与 doc-maintenance 结合**：所有 SDD 文档遵循 doc-contract 规范；任务完成后用 docs-scan 检查文档结构完整性

## 范围

### 做（本 issue 覆盖）

- SDD 目录结构与规范文档（已创建 readme 与规范）
- 五层文档体系规划与最小文档集（已创建 [文档分类体系](docs/guide/02-document-taxonomy.md)）
- 首个开发任务的 plan 编写 + review + 实现 + 验证全流程
- 本项目 AGENTS.md 的补充：把"每个任务走 issue→plan→review→实现→review→测试→归档"写入项目规则（如尚无对应章节）

### 不做（明确排除，后续 issue 再考虑）

- Agent 并发调度（多 agent 并行、Paseo 深度编排）
- Harness 自我迭代机制（定期回顾对话优化工作流）
- 意图测试（视觉模型驱动的产品全流程测试）
- 文档更新定时任务

## 版本控制模式（本项目的决策）

博客作者是纯本地项目（无 GitHub issue、无远程仓库）；**本项目走 GitHub 协作流程**：

- 本地 SDD 文档（docs/issues、docs/plans 等）**全部纳入 git 仓库并推送 GitHub**，与代码同一仓库管理
- GitHub issue/PR 用于协作与合并流程（已有 [开发流程规范](docs/guide/01-development-workflow.md)），本地 SDD 文档用于任务规格与 Agent 上下文
- 两者并行：GitHub issue 记录任务入口（含验收标准），SDD 文档承载详细规格与方案
- 目的：熟悉真实团队协作流程（PR、review、分支保护），服务实习准备

## 验收标准

- [ ] `docs/issues/`、`docs/plans/` 结构建立，规范文档齐全，`docs/INDEX.md` 已同步
- [ ] 首个任务有完整 `issue.md` + `plan.md`，且 plan 经过独立 review（review 意见可追溯）
- [ ] 首个任务实现完成，有可运行结果（哪怕是骨架可启动）
- [ ] 首个任务有基础验证（测试或最小手动验证记录）
- [ ] 实现 review 完成，改动说明与合并确认走通
- [ ] 任务归档：issue/plan 移入 `close/`，状态置 `archived`
- [ ] AGENTS.md 已补充 SDD 流程约定
- [ ] docs-scan 通过（文档结构、frontmatter、INDEX 一致）

## 参考

- [Harness Engineering 实践分享](https://blog.xlab.app/p/c3ac2cfd/) — 方法论来源
- [开发流程规范](docs/guide/01-development-workflow.md) — 本项目已有 issue/PR/commit 规范（SDD 与之并行：GitHub issue 管协作，本地 SDD 文档管任务规格）
