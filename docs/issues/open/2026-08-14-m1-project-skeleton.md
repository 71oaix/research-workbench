---
title: M1 项目骨架初始化（monorepo + 前后端脚手架 + SQLite + CI）
status: active
created: 2026-08-14
updated: 2026-08-14
kind: infra
priority: high
triage: actionable
areas: [project-setup, web, server, data, ci]
resolution_plan: "docs/plans/open/2026-08-14-m1-project-skeleton.md"
---

# M1 项目骨架初始化

## 背景

研镜已完成设计阶段：MVP 基线（全角色闭环）、技术栈（React + Node/TS + pi SDK + SQLite）、SDD 工作流均已确定。仓库目前只有文档，没有可运行的工程骨架。后续所有功能（WorkflowEngine、学术检索、综述生成、审批 UI、可观测面板）都需要一个统一的代码基座。

## 目标

建立 monorepo 工程骨架，让“一条命令起前端 + 后端、数据库自动初始化、CI 自动检查”成为现实，为 M2 功能开发铺路。

## 范围（做）

- 根工程：npm workspaces（apps/web、apps/server、packages/shared、packages/data）
- 前端：Vite + React 最小工作台占位页（三栏布局骨架 + 后端健康状态显示）
- 后端：Hono 服务（`/health` 接口 + WebSocket 升级占位）
- 数据：SQLite 接入 + 初始 schema（workflows / steps / artifacts / papers / decisions）+ 仓储接口
- 共享：WS 协议与核心类型（packages/shared）
- CI：GitHub Actions 最小流水线（install → typecheck → build → test）
- 文档：runbook、系统架构初版、数据模型初版

## 不做（明确排除）

- 任何角色 agent 逻辑（Planner / Researcher / Writer / Reviewer）
- 学术 API 接入（Semantic Scholar / OpenAlex / arXiv）
- 工作流引擎与审批流
- 正式 UI 设计（仅占位页）
- Docker / PostgreSQL（决策 #5：后期交付形态）
- 认证、多用户、部署

## 验收标准

- [ ] 一条命令（`npm run dev`）启动前后端；浏览器打开 http://localhost:5173 显示工作台占位页，并显示后端健康状态 OK
- [ ] 后端 http://localhost:3000/health 返回 200 / OK；SQLite 初始化生成数据文件
- [ ] `npm run typecheck`、`npm run build`、`npm test` 全部通过
- [ ] GitHub Actions CI 绿
- [ ] docs/guide/runbook.md 按步骤可复现
- [ ] issue/plan 归档，docs/INDEX.md 同步
