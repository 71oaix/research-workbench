# Research Workbench（研镜）

> 面向科研人员的透明学术调研智能体工作台
> 状态：设计阶段（2026-08-05）

## 一句话

让研究生用一杯咖啡的时间完成原本一周的文献调研初稿——每一步可查、每句引用可溯源、成本可控。

## 背景

第八届中国研究生人工智能创新大赛 · 开放赛题一：生成式大语言模型与智能体。

## 定位

- 不做通用 Harness，不做 coding agent
- 聚焦学术文献调研：规划 → 检索 → 精读 → 综述 → 审查 → 审批
- 三支柱：可观测（Observable）/ 可追踪（Traceable）/ 可控（Controllable）

## 技术栈（MVP 定稿）

- 前端：React + Vite + Zustand + WebSocket
- 后端：Node/TS + pi SDK 运行时（复用成熟单智能体执行内核）
- 数据：SQLite（MVP 零部署成本，后续可换 PostgreSQL）
- 模型：OpenAI 兼容接口（DeepSeek / Qwen / OpenAI），自带 key
- 形态：本地 Web 工作台（MVP 不做 Electron）

## 文档

- [00 · 项目定义（草稿）](docs/00-project-definition.md) — 目标、约束、功能、复用盘点
- [01 · 开发流程规范](docs/01-development-workflow.md) — issue / PR / 提交规范
