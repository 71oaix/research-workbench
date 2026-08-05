---
title: 讨论记录（2026-08-04 → 08-05）
status: active
created: 2026-08-05
updated: 2026-08-05
---

# 讨论记录（2026-08-04 → 08-05）

按时间记录本项目从方向讨论到基线确认的各轮讨论节点。每条记录“议题 → 讨论要点 → 结论”。

| 时间 | 议题 | 讨论要点 | 结论 / 去向 |
|------|------|----------|-------------|
| 08-04 | 审视已有资产与参赛方向 | pi-desktop-client 已完成健康化（git 基线 / 测试 / 打包）；用户不再为 pi 专门搭建 agent，改用现有成熟工具；想把已有工作转化为竞赛作品 | 决定参赛；作品独立成新项目，资产按“工程经验”复用 |
| 08-04 | 赛题选择：华为赛题 3 vs 开放赛题 1 | 华为赛题 3 是算法题（F1 70% + 效率 20% + 结构化 10%），与 PaSa/SPAR 基线竞争、自由度低；开放赛题 1 为 100% 专家评审，可复用“可观测 / 可追踪 / 可控”能力，且有获奖先例 | 主投开放赛题一；落地场景=学术文献调研；赛题 3 调研纪要取消 |
| 08-04 | 作品定位：避免“复制 Codex” | 通用 Harness 追求更强更快；我们的差异化在编排与治理，而非单 agent 执行 | 三支柱：可观测（Observable）/ 可追踪（Traceable）/ 可控（Controllable）；审批产物而非动作 |
| 08-04 | 继承“糯米糍”概念 | 多 agent 之间用 artifact 文档交接；用户侧体验连续不割裂；agent 上下文相互隔离防污染 | 作为架构基础：WorkflowEngine + Artifact 管理 + 审批流 |
| 08-05 | 目标 → 约束 → 技术栈推导流程 | 先定最终目标，再推约束与限制，再推导功能，再定技术栈，最后盘点可复用资产 | 确立自上而下的推导方法；确定新项目 research-workbench 与 pi 客户端定位不同 |
| 08-05 | 实习 JD 映射 | JD 要求结构化 issue、AI 主力开发、Python/Go/Rust、React、Docker/Postgres、RAG/Agent、side project | 重点展示规范流程与完整产品；不因 JD 强行堆技术栈（尤其 Python） |
| 08-05 | MVP 范围 | 最小闭环实验 vs 完整作品 | 做完整作品；MVP=全角色闭环（Planner → Researcher → Writer → Reviewer + 双审批 + 导出） |
| 08-05 | 运行时选型：pi SDK 还是自研 | 用户质疑“为什么不用 pi SDK”；pi SDK 是否符合 artifact 交接 / 上下文隔离理念 | 复用 pi SDK（单智能体执行内核）；理念在 WorkflowEngine / Artifact / 审批上层实现 |
| 08-05 | 数据层：SQLite vs PG + Docker | 机器未安装 Docker / WSL；装 WSL2 + Docker 需要管理员与重启；PG 对 MVP 非必需 | MVP 用 SQLite + 仓储抽象；PostgreSQL + Docker 后期作为交付形态 |
| 08-05 | 产品形态：Web vs Electron | 前端演示效果优先；桌面壳开发时间不长 | 形态后置：先做内核与功能，最终形态待定 |
| 08-05 | 流程规范化 | 不想每个项目重新讲一遍规范；doc-maintenance 已有通用 Git/GitHub 规范 | 建 project-template 模板仓库；research-workbench 推送 GitHub、main 分支保护、全部改动走 PR |

> 本记录只含讨论节点与结论；详细决策见 `decisions/2026-08-05-mvp-baseline.md`。后续新节点追加到本文件并同步 `docs/INDEX.md`。
