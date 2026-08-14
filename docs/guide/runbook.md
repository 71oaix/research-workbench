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

## M2-1 工作流接口示例

```bash
# 1. 创建工作流（planner 与 reviewer 是审批点）
curl -X POST http://localhost:3000/workflows \
  -H "Content-Type: application/json" \
  -d '{"goal":"调研 LLM 测试","steps":[{"label":"生成计划","role":"planner","requiresApproval":true},{"label":"检索文献","role":"researcher","requiresApproval":false},{"label":"审查","role":"reviewer","requiresApproval":true}]}'

# 2. 开始执行 → 停在第一个审批点
curl -X POST http://localhost:3000/workflows/<id>/start

# 3. 审批（approve / reject）
curl -X POST http://localhost:3000/workflows/<id>/steps/<stepId>/decision \
  -H "Content-Type: application/json" \
  -d '{"type":"approve","note":"计划可行"}'

# 4. 查看完整工作流（步骤 + artifact + 决策）
curl http://localhost:3000/workflows/<id>
```

## 常见问题

- 端口被占用：设置环境变量 `PORT`（server）或修改
  `apps/web/vite.config.ts` 的 `server.port`
- 浏览器显示“后端未连接”：确认 3000 端口已启动，或检查 Vite 代理配置
