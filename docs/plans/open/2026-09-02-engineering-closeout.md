---
title: 工程化收尾：质量门、文档一致性与可复验交付（plan）
status: active
created: 2026-09-02
updated: 2026-09-03
issue: "docs/issues/open/2026-09-02-engineering-closeout.md"
areas: [ci, docs, tooling, release]
---

# 工程化收尾：质量门、文档一致性与可复验交付（plan）

## 任务摘要

为研究工作台建立一个不依赖外网和密钥的工程化收尾入口：统一执行类型检查、构建、测试与文档契约检查，同时修复已知文档漂移。这样后续每次开发都能用一条命令判断“代码、文档、CI 是否仍处于可交付状态”。本任务不改变页面交互，因此不提供 UI 设计图或 HTML 预览；验收以命令输出和文档事实一致性为准。

## 原因

当前 CI 只执行 `typecheck → build → test`，没有文档完整性门；根命令没有统一验证入口；真实运行脚本依赖服务、模型 key 和学术源，无法作为 CI 证据。全量审计还发现 README/架构文档滞后、INDEX 漏登文档和失效链接。若不先收口，后续修复和资产抽取会继续在不一致的上下文上累积。

## 预计效果

- 新贡献者可以运行 `npm run verify` 得到稳定的本地质量结论。
- CI 与本地使用同一验证契约，文档漂移会在合并前暴露。
- 联网真实验证与离线工程门分层，避免把偶然的外部服务成功当作可重复质量。
- 当前架构事实、任务状态和竞赛产物路径可被下一位维护者直接理解。

## 关键决策

| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 总入口 | 新增无副作用的 `npm run verify` | 继续让开发者记忆多条命令 | 单一质量门最容易复验，也能在 CI 与本地复用 |
| 文档检查 | 使用项目内轻量 Node 脚本，不依赖网络 | 引入重量级文档工具或在线链接服务 | 项目是本地 Web MVP，检查应能离线稳定运行 |
| 联网验证 | 保留现有 verify/eval/probe 脚本为手动路径 | 把模型和学术源接入 CI | 外部服务不稳定且会消耗费用，不适合作为基础门 |
| 文档事实源 | 当前实现与最新合并状态优先，历史 issue/plan 保留归档 | 删除历史记录 | 保留 SDD 复盘价值，同时避免历史描述冒充当前状态 |
| 质量范围 | 本任务只收工程入口和文档一致性 | 顺手修运行时 P0 | 运行时正确性需要独立设计、失败测试和更高风险评审 |

## Review 发现与修正

- 审计初稿倾向于同时加入安全下载器和执行引擎重构；这些会改变运行时语义，已移入后续 P0，不放进本收尾任务。
- 不能把 `npm run build` 的当前行为描述成完整生产打包；计划会明确“server build 当前为类型检查，正式服务打包另立任务”。
- 文档检查必须只读；不得为了生成报告修改 INDEX、数据库或评测输出。
- 不自动把所有 `open/` 文档归档；只有已由远端合并事实确认的任务才更新状态，未确认的继续保留。

## 实现步骤

0. 在修改事实性文档前读取远端合并状态（`git fetch` / `gh pr view` 可用时执行）；若权限或网络不可用，记录失败并不得把本地分支状态写成已合并事实。
1. 新增 `scripts/verify-docs.mjs`：仅扫描 `docs/**/*.md`（排除 `node_modules`、`.git`、`.zcode`、`data/eval` 和源码内 Markdown），检查 frontmatter 必填字段与合法状态；校验 INDEX 路径、标题和状态；发现孤儿/幽灵；解析相对 Markdown 链接（忽略外链、锚点和图片链接）并报告不存在目标；把 INDEX 非表格异常行作为错误；输出机器可读的失败摘要。
2. 新增 `scripts/verify-project.mjs` 或等价入口：串行运行项目既有 typecheck、build、test 与 docs 检查，保留每个阶段的退出码和清晰标题；保证不调用网络服务；为 PDF 测试产物设置临时目录并在退出时清理。
3. 在根 `package.json` 增加 `verify` 脚本；CI 改为调用同一入口，并保留必要的 Node 22 约束。
4. 修复已知文档问题并逐项记录：
   - `docs/guide/runbook.md`：`../plans/open/2026-08-14-m1-project-skeleton.md` → `../plans/close/2026-08-14-m1-project-skeleton.md`。
   - `docs/issues/close/2026-08-06-sdd-workflow.md`：四处 `docs/guide/...` → `../../guide/...`，分别指向 `02-document-taxonomy.md` 和 `01-development-workflow.md`。
   - `docs/issues/open/2026-09-01-quality-loop-and-evidence-bar.md`：`2026-09-01-firecrawl-web-search.md` → `../close/2026-09-01-firecrawl-web-search.md`。
   - `docs/plans/close/2026-08-14-m2-3-academic-search.md`：`../research/...` → `../../research/2026-08-14-academic-search-best-practices.md`。
   - 登记 `docs/specification/2026-08-28-demo-video-script.md`；删除 INDEX 字面量 `@@`；更新 README、AGENTS、M1 架构文档中的当前阶段描述；为竞赛导出物补充唯一正式路径说明。
5. 在 `docs/guide/runbook.md` 增加“离线工程验证 vs 联网真实验证”小节，并标注 server build 的当前边界。
6. 运行全量验证、docs-scan 和一次 CI 等价命令；用任务开始时记录的工作树快照对比，只检查本任务允许文件，不覆盖用户既有改动；记录结果并更新 issue/plan 验收段。

## 测试与验证方案

- `npm run verify`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `node scripts/verify-docs.mjs`
- 对故意缺少 frontmatter、幽灵 INDEX、失效链接、INDEX `@@` 异常行的临时 fixture 做单元级验证；fixture 不进入仓库。
- 验证 `npm run verify` 前后 `git status --short`、SQLite 文件、`data/pdfs-test` 和评测输出目录的快照一致；若既有测试必须落盘，则改为系统临时目录并在 finally 清理。
- 不运行真实模型/Firecrawl/学术源脚本作为 CI 必需条件。

## UI / 预览

本任务不涉及页面、组件、交互或视觉样式改动，因此无 UI 设计图和 HTML 预览；实现阶段的验收凭 `npm run verify` 输出与文档扫描结果完成。

## 需要同步更新的文档

- `docs/INDEX.md`
- `README.md`
- `AGENTS.md`
- `docs/architecture/02-system-architecture.md`
- `docs/guide/runbook.md`
- 本 issue 与 plan 的状态和验收记录

## 验收标准

- `npm run verify` 退出码为 0，并依次输出且可区分 `typecheck`、`build`、`test`、`docs` 四个阶段；任一阶段失败时返回非 0。
- `npm run verify` 不读取 API key、不访问外部服务；运行前后 `git status`、SQLite 数据库、`data/pdfs-test` 和评测输出目录无新增或修改（测试所需临时文件必须使用临时目录并在退出时清理）。
- CI 只调用 `npm run verify` 作为同一质量门，Node 版本与本地约束一致；联网脚本不进入 CI。
- `node scripts/verify-docs.mjs` 报告 frontmatter 缺失、非法状态、INDEX 漏登/幽灵、失效相对链接和 INDEX 异常行均为 0；扫描范围仅为 `docs/**/*.md`，明确排除 `node_modules`、`.git`、`.zcode`、`data/eval` 与源码内 Markdown。
- 已知文档清单逐项修复并可复核：`docs/specification/2026-08-28-demo-video-script.md` 登记到 INDEX；`docs/guide/runbook.md`、`docs/issues/close/2026-08-06-sdd-workflow.md`、`docs/issues/open/2026-09-01-quality-loop-and-evidence-bar.md`、`docs/plans/close/2026-08-14-m2-3-academic-search.md` 的 5 个唯一失效相对链接修正；删除 INDEX 第 113 行字面量 `@@`；README、AGENTS、当前架构、runbook 和竞赛导出物路径说明与实现/远端合并事实一致。
- 保留当前工作树中与本任务无关的既有改动；以本任务开始时的 `git status` 快照为基线，只验证新增/修改文件是否属于允许清单，不要求工作树全局洁净。
- 用户不看代码时，只需执行 `npm run verify`，并阅读 runbook 的离线/联网验证说明，即可判断本地工程是否达到可交付状态；联网真实效果仍以仓库中明确列出的手动脚本和前置条件为准。

## 验收记录（2026-09-03）

- [x] `npm run verify` 在受控环境通过，四阶段退出码均为 0，最终 `sideEffects: false`。
- [x] `node scripts/verify-docs.mjs`：119 份 Markdown，所有计数项为 0。
- [x] 临时 fixture 验证了 frontmatter/INDEX 链接扫描器的失败路径，fixture 已清理。
- [x] 远端 PR #33、PR #35 合并事实已核对，PR #39 保持 OPEN，未将本地分支误写为已合并。
- [x] 远端 GitHub Actions：PR #40 的 build 检查通过（GitHub Actions run 33660423309）；本地等价命令不替代平台证据。
