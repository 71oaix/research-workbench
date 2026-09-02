# Research Workbench（研镜）项目规则

## 项目定位

面向科研人员的透明学术调研智能体工作台：输入研究问题 → 规划 → 多源检索 → 综述生成 → 引用审查 → 审批导出，全过程可观测、可追踪、可控制。用于第八届中国研究生人工智能创新大赛（开放赛题一）与实习作品集。

## 目录约定

- `docs/` — 文档；必须维护 `docs/INDEX.md`；按 `architecture/`、`specification/`、`guide/`、`research/`、`reference/`、`decisions/` 分类（映射规范见 [文档分类体系](docs/guide/02-document-taxonomy.md)）；SDD 任务文档独立于 `issues/`、`plans/`
- `.github/` — issue / PR 模板与流程配置
- 代码目录 — `apps/web`（前端）、`apps/server`（后端）、`packages/shared`（共享协议）、`packages/data`（SQLite 仓储）；MVP 骨架已建立，后续按 SDD 增量演进
- `scripts/` — 辅助脚本

## 技术栈（MVP 定稿）

- 前端：React + Vite + Zustand + WebSocket
- 后端：Node/TS + pi SDK 运行时
- 数据：SQLite（仓储层抽象，后续可换 PostgreSQL）
- 模型：OpenAI 兼容接口（DeepSeek / Qwen / OpenAI），自带 key
- 形态：本地 Web 工作台（MVP 不做 Electron）

## 文档规则

- 文档遵循 doc-contract：frontmatter 必填 `title / status / created / updated`
- 状态只有 `active | archived`；被替代的文档标记 `archived` 并填写 `supersedes`
- 创建、修改、移动、归档文档后，必须同步更新 `docs/INDEX.md`
- 归档不删除

## SDD 开发流程（重要）

- 本项目的功能开发遵循轻量 SDD：`docs/issues/`（要做什么）+ `docs/plans/`（怎么做），结构与规范见 [issues 目录规范](docs/issues/readme.md)
- 接到开发/修复/重构任务时，**加载 `sdd-development` skill** 并按其循环执行：issue → plan → plan review → 人确认 → 实现 → 实现 review → 测试 → 人确认合并 → 归档
- 未经用户确认 plan，不得开始实现（小改动除外）
- plan/合并产物必须满足 skill 中的"产出硬性要求"（任务解释、关键决策、UI 预览、改动说明、预览地址）——用户不看代码也能验收

## Git / GitHub 协作规范（所有 agent 通用）

1. **改动前**：`git fetch` + `git pull`，确保基于最新内容修改。
2. **改动后**：`git add` 具体文件 → `git commit` → `git push`。
   - 提交信息格式：`<类型>: <中文摘要>`，例如 `docs: 补全 INDEX.md`、`feat: 接入检索工具`
   - 常用类型：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`
3. **冲突处理**：推送被拒时先 `git pull --rebase` 再推；无法自动解决时停下询问用户，不覆盖任何人的修改。
4. **分支策略（PR 流程约定）**：main 是唯一主线，所有改动一律走 PR，不直接推 main：
   - `git checkout -b feature/<说明>` 或 `fix/<说明>` 新建分支
   - 提交并推送：`git push -u origin feature/<说明>`
   - 用 `gh pr create --fill` 发起 PR，等待用户审阅后合并
   - 禁止对 main 直接推送、force push 或删除分支
   - main 已启用分支保护（GitHub 强制执行）
5. **凭据安全**：token/密钥绝不写入仓库文件或 AGENTS.md；GitHub 认证统一用 `gh auth login`。
6. **提交后**：向用户简要汇报提交号与变更内容。

## Definition of Done

- [ ] 代码可运行，端到端验证过
- [ ] 自动化测试（如有）通过
- [ ] README / docs/INDEX.md 已同步
- [ ] PR 描述包含演示截图或说明

## 决策记录

- 2026-08-05：MVP 不因实习要求堆技术栈；运行时复用 pi SDK；先做本地 Web；数据先用 SQLite；流程规范对齐 project-template
- 详见 `docs/decisions/2026-08-05-mvp-baseline.md`
