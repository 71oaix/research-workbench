---
title: MVP 基线决策记录
status: active
created: 2026-08-05
updated: 2026-08-05
---

# MVP 基线决策记录（2026-08-05）

本次讨论确认的决策。后续变更需另起决策记录并更新本文档状态。

| # | 决策 | 结论 |
|---|------|------|
| 1 | 最终目标 | 做完整作品：9/1 前交付可演示的透明学术调研工作台，同时以规范 GitHub 流程作为实习证据 |
| 2 | MVP 范围 | 全角色闭环：Planner → Researcher → Writer → Reviewer + 双审批（计划 / 成品）+ 导出 |
| 3 | 运行时 | 复用 pi SDK（Node/TS），不重新实现单智能体执行循环 |
| 4 | 产品形态 | 后置；先做内核与功能，前端演示效果优先，最终 Web / 桌面待定 |
| 5 | 数据层 | MVP 用 SQLite + 仓储抽象；PostgreSQL + Docker 后期作为交付形态 |
| 6 | 流程规范 | 对齐 doc-maintenance 的通用 Git/GitHub 规范，纳入 project-template 统一模板 |
| 7 | 技术栈不因实习倒推 | 不为实习 JD 强行堆 Python / Docker / Postgres |
