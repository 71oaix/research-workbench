# 00 · 项目定义（草稿 v0.1）

> 状态：基本定稿（MVP）· 最后更新：2026-08-05
> 用途：竞赛（第八届中国研究生人工智能创新大赛 · 开放赛题一）+ 实习作品集

## 1. 最终目标

- **竞赛**：9/1 前提交（300 字简介 + 标准模板项目文档 + 演示视频 + 可选辅助材料），通过初赛、进入决赛答辩
- **实习**：以规范化的 GitHub 流程（issue/PR/文档）和完整的 side project 作为主要证据；不为了实习要求强行堆技术栈
- **产品**：一杯咖啡时间完成一周文献调研初稿；每一步可查、每句引用可溯源、成本可控

## 2. 硬约束

- 时间：8/20 功能闭环；8/25 报名 + 材料初稿；9/1 作品提交
- 资源：1 人主力 + AI；免费学术 API（Semantic Scholar / OpenAlex / arXiv）；OpenAI 兼容模型
- 技术：MVP 不因实习要求倒推技术栈，先做最小闭环实验
- 评审：开放赛题专家评审；提交材料匿名（不得出现学校/学院/导师信息）
- 队伍：官方规则 2–3 人/队（待确认）
- 非目标：通用 Harness / coding agent / 自定义工作流编辑器 / PDF 全文解析 / 团队协作 / 移动端 / Python 服务层（MVP 不做）

## 3. 功能（P0 / P1）

### P0（闭环必需）

**编排层**
- 工作流启动与计划生成：输入研究问题 → Planner 输出检索计划（子问题/关键词/大纲）
- 计划审批：可编辑、批准、打回
- 状态机与 artifact 交接：步骤状态、版本历史、审批记录全部落库

**检索层**
- 三源检索：Semantic Scholar / OpenAlex / arXiv，统一论文对象模型
- 筛选与文献卡片：相关性评分、去重，卡片含摘要/DOI/年份/引用数
- 证据抽取：每个论断绑定论文 + 摘要片段，可跳原文

**生成与审查层**
- 综述初稿生成：Writer 按大纲撰写，引用自动标注
- 引用核查：Reviewer 检查真实性/相关性/覆盖度
- 成品审批与导出：Markdown / Word + 引用清单

**交互与可观测层**
- 工作流视图与审批 UI：步骤时间线、状态灯、审批卡片
- 可观测面板：工具调用、思考、角色提示词、上下文、人民币成本
- 预算上限：超限自动暂停等审批
- 本地持久化：PostgreSQL 存论文/artifact/审计日志

### P1（看时间）

- pgvector 相似论文召回/主题聚类
- 离线演示数据包（防断网）
- 断点续跑、历史工作流复用
- 角色提示词可编辑
- 导出 Word 模板

## 4. 技术栈（MVP 定稿）

- 前端：React + Vite + Zustand + WebSocket（本地 Web 工作台）
- 后端：Node/TS + pi SDK 运行时（复用成熟单智能体执行内核）
- 数据：SQLite（零部署成本）；仓储层抽象，后续可换 PostgreSQL/pgvector
- 模型：OpenAI 兼容接口（DeepSeek / Qwen / OpenAI），自带 key
- 形态：MVP 不做 Electron，浏览器即可演示
- 决策记录：运行时复用 pi SDK；不因实习要求引入 Python 服务层；PostgreSQL/Docker 延后

## 5. 复用资产盘点

- **直接复用**：pi SDK 运行时（SessionPool/EventRouter/WS 协议）、React 组件模式、Zustand store、StatusBar/成本/上下文逻辑、测试经验
- **改造复用**：SessionPool → 角色 Runtime 池；MarkdownRenderer → artifact 渲染；技能系统 → 角色提示词模板；右栏参考面板 → 论文证据面板
- **不搬**：Electron 主进程/托盘/IPC、checkpoint 记忆系统（改为 artifact 交接）、pi 相关文档与命名

## 6. 里程碑

- M1 骨架（8/12）：Docker Compose + PG schema + Provider 抽象 + 事件协议
- M2 闭环（8/20）：四角色端到端跑通 + 审批 UI + 可观测面板
- M3 材料（9/1）：演示案例 + README + 演示视频 + 申报文档
