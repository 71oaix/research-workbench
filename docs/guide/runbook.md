---
title: 本地运行手册（runbook）
status: active
created: 2026-08-14
updated: 2026-08-14
---

# 本地运行手册

## 前置要求

- Node.js 22（LTS），见 `.nvmrc`
- npm（Windows PowerShell 下请用 `npm.cmd`）

## 安装依赖

```bash
npm.cmd install
```

> 若 better-sqlite3 安装失败，先确认 Node 版本为 22；仍失败则回退方案见
> [M1 plan](../plans/open/2026-08-14-m1-project-skeleton.md) 的风险表。

## 启动开发环境

```bash
npm.cmd run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000/health
- SQLite 数据文件：`data/app.db`（自动创建）

## 验证

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test
```

## 常见问题

- 端口被占用：设置环境变量 `PORT`（server）或修改
  `apps/web/vite.config.ts` 的 `server.port`
- 浏览器显示“后端未连接”：确认 3000 端口已启动，或检查 Vite 代理配置
