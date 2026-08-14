---
title: M1 项目骨架初始化（plan）
status: archived
created: 2026-08-14
updated: 2026-08-14
issue: 2026-08-14-m1-project-skeleton
areas: [project-setup, web, server, data, ci]
---

# M1 项目骨架初始化（plan）

## 任务解释

搭出可运行的前后端 + 数据库 + CI 基座，让后续所有功能开发都在同一套骨架上进行；本次不实现任何业务功能。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| 工程结构 | npm workspaces monorepo（apps/web、apps/server、packages/shared、packages/data） | pnpm workspace；单包 | 环境已有 Node/npm，零额外安装；共享类型与协议，避免复制粘贴 |
| 后端框架 | Hono + @hono/node-server | Express / Fastify | 旧项目已用 Hono 验证；轻量、TS 友好、WebSocket 支持好 |
| 数据访问 | better-sqlite3 + 手写仓储接口（若原生模块安装失败，回退 Node 内置 `node:sqlite`） | Prisma / Drizzle | MVP 数据量小；同步 API 简单直接；仓储接口保留换 Postgres 的余地 |
| SQLite 位置 | `data/app.db`（已 gitignore） | 纯内存库 | 便于手动查看调试；测试用临时文件库 |
| pi SDK 接入 | server 内定义 `AgentRuntimeProvider` 抽象接口，M1 只留类型与空实现 | 直接创建 Runtime | 不绑定实现细节；M2 再填 pi SDK 真实接入 |
| 事件协议 | packages/shared 定义 WS 消息类型，复用旧客户端 JSON 事件风格 | 从零设计 | 降低前端复用成本 |
| CI | GitHub Actions（install → typecheck → build → test） | 其他平台 | 仓库在 GitHub，最直接 |
| 一键启动 | scripts/dev.js 并行拉起 server + web（node 直调 vite） | concurrently 等 | 旧项目已验证 node 直调可避免 npx 子进程问题 |
| Node 版本 | 固定 Node 22 LTS（`engines` + `.nvmrc`） | 不固定 | better-sqlite3 原生模块依赖预编译产物，固定 LTS 最稳；也便于 CI 复现 |

## 目录结构（目标）

```text
research-workbench/
├── apps/
│   ├── server/          # Hono + WS + AgentRuntimeProvider 抽象
│   └── web/             # Vite + React 占位页
├── packages/
│   ├── shared/          # WS 协议 + 核心类型
│   └── data/            # SQLite schema + 仓储接口/实现
├── scripts/dev.js       # 一键启动
├── docs/                # 设计文档（现有）
└── .github/workflows/ci.yml
```

## 占位页 UI 线框（M1 仅此程度，非正式设计）

```text
┌────────────────────────────────────────────────┐
│ Titlebar: 研镜 Research Workbench              │
├──────────────┬─────────────────┬───────────────┤
│ 左侧          │ 中央工作区        │ 右侧面板        │
│ 工作流列表     │ 占位内容          │ 引用 / 证据占位  │
│ （占位）      │ 后端状态: ● OK    │ （占位）        │
└──────────────┴─────────────────┴───────────────┘
```

## 实现步骤

1. **根工程**：`package.json`（workspaces + scripts + engines）、`.nvmrc`、`tsconfig.base.json`、README 快速开始
2. **packages/shared**：`src/types.ts`（Workflow / Step / Artifact / Paper / Decision）、`src/ws-protocol.ts`（消息类型）
3. **packages/data**：`src/db.ts`（better-sqlite3 初始化）、初始 schema、仓储接口 + SQLite 实现（workflow / step / artifact / paper / decision）；包间依赖用 `workspace:*` 声明
4. **apps/server**：`src/index.ts`（Hono + `/health`，返回 `{ status, db }`，db 为 SQLite 连通性检查）、`src/ws.ts`（WS 升级占位）、`src/runtime/provider.ts`（AgentRuntimeProvider 接口 + 空实现）
5. **apps/web**：Vite + React 占位页（三栏 + 健康检查）
6. **scripts/dev.js**：并行启动 server + web
7. **CI**：`.github/workflows/ci.yml`
8. **文档**：新建系统架构、数据模型、runbook，更新 INDEX 与 README

> 端口约定：web=5173、server=3000，均支持环境变量覆盖，端口被占时给出明确报错。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| better-sqlite3 原生模块在 Windows 上无预编译产物 | 安装失败、无法启动 | 固定 Node 22 LTS；若仍失败，回退 Node 内置 `node:sqlite`（仓储接口不变，只换实现） |
| 端口 5173/3000 被占用（旧客户端也可能占用 3000） | 启动冲突 | 环境变量覆盖端口 + 明确报错信息 |
| npm workspaces 依赖提升导致包间引用失效 | 类型/运行时找不到模块 | 统一用 `workspace:*` 声明 + typecheck 兜底 |

## 测试方案

- **packages/data**：vitest 单测（仓储 CRUD，使用临时 SQLite 文件）
- **apps/server**：`/health` 接口测试（Hono `app.request()` 直接调用，不额外引入 supertest）
- **apps/web**：最小 smoke 测试（渲染占位页）
- **手动验证**：`npm run dev` → 浏览器打开 http://localhost:5173，占位页显示后端状态 OK
- **CI**：typecheck + build + test 全绿

## 文档更新清单

- `docs/architecture/02-system-architecture.md`（新建）
- `docs/architecture/03-data-model.md`（新建）
- `docs/guide/runbook.md`（新建）
- `docs/INDEX.md`（登记上述文档）
- `README.md`（快速开始）

## 独立 review

> 说明：本次独立 review 原计划由 fresh-context 子 agent 执行，子 agent 通道未成功取回结果，改由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-14
- 审查视角：交付完整性（能否不写代码就验收）、可执行性（步骤是否可照做）、与既定决策一致性
- 发现与处理：
  - [major] better-sqlite3 原生模块在 Windows 存在安装风险 → 已补充固定 Node 22 LTS + `node:sqlite` 回退方案
  - [major] `/health` 验收要求覆盖 SQLite，原 plan 未明确 → 已明确返回 `{ status, db }` 并做连通性检查
  - [minor] 未指定 Node 版本 → 已加 `engines` + `.nvmrc`
  - [minor] npm workspaces 包间依赖易被 hoisting 打乱 → 已明确用 `workspace:*`
  - [minor] 端口冲突未处理 → 已加环境变量覆盖与明确报错
  - [minor] supertest 属多余依赖 → 改用 Hono `app.request()`
