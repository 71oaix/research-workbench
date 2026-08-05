# Research Workbench（研镜）

> 透明学术调研智能体工作台 — 第八届中国研究生人工智能创新大赛（开放赛题一）+ 实习作品集

## 项目范围（MVP）

| 包含 | 不包含 |
|------|--------|
| 多角色工作流编排（Planner / Researcher / Writer / Reviewer） | 通用 Harness / coding agent |
| artifact 产物交接 + 双审批流（计划 / 成品） | 自定义工作流编辑器 / PDF 全文解析 |
| 多源学术检索（Semantic Scholar / OpenAlex / arXiv） | 团队协作 / 移动端 |
| 引用级溯源 + 可观测（成本 / 上下文 / 系统提示词） | 模型训练 / Python 服务层（MVP） |

## 技术栈（MVP 定稿）

- 前端：React + Vite + Zustand + WebSocket
- 后端：Node/TS + pi SDK 运行时
- 数据：SQLite（仓储层抽象，后续可换 PostgreSQL）
- 模型：OpenAI 兼容接口（DeepSeek / Qwen / OpenAI），自带 key
- 形态：本地 Web 工作台，不做 Electron

## 开发流程（强制）

1. 所有改动先有 issue，按 `.github/ISSUE_TEMPLATE` 填写（背景 / 需求 / 验收标准 / 涉及模块）
2. 分支命名：`feat/<issue号>-<简述>` 或 `fix/<issue号>-<简述>`
3. PR 按 `.github/PULL_REQUEST_TEMPLATE.md` 填写，squash merge 后关闭关联 issue
4. commit 使用 conventional 风格：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`
5. 每个 PR 的 Definition of Done：可运行 + 验证过 + 文档同步
6. 重大设计决策先写进 issue 讨论，再动手

## 文档约定

- `README.md` — 对外介绍
- `docs/00-project-definition.md` — 目标 / 约束 / 功能 / 技术栈
- `docs/01-development-workflow.md` — 开发流程规范

## 关键决策记录

- 2026-08-05：MVP 不因实习要求堆技术栈；运行时复用 pi SDK；做本地 Web 工作台；数据用 SQLite
