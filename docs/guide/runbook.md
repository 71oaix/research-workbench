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

## M2-2 模型配置与验证

环境变量（key 绝不写入仓库）：

```bash
OPENCODE_GO_API_KEY=sk-...   # 必填，opencode go 订阅 key
PI_PROVIDER=opencode-go      # 可选，默认 opencode-go
PI_DEFAULT_MODEL=deepseek-v4-flash  # 可选，默认值
PI_MODEL_PLANNER=...         # 可选，每角色覆盖（仅模型 ID）
PI_MODEL_RESEARCHER=...
PI_MODEL_WRITER=...
PI_MODEL_REVIEWER=...
PI_WORKBENCH_AGENT_DIR=...   # 可选，pi 会话隔离目录（默认 <项目根>/.pi/agent）
```

真实调用验证（服务已启动且进程带 key）：

```bash
node scripts/verify-m2-2.mjs
```

> 说明：角色 system prompt 通过 pi SDK 的 `resourceLoaderOptions.systemPromptOverride`
> 注入（0.80.3 直接改 `agent.state.systemPrompt` 会被覆盖）；运行时禁用编码工具（`noTools: 'all'`）。
>
> 会话隔离：研镜的 pi 会话默认写入项目内 `.pi/agent`，与个人 PI 的 `~/.pi/agent` 完全隔离，
> 不会出现在 PI coding agent 的会话列表里；如需换位置，设置 `PI_WORKBENCH_AGENT_DIR`。

## M2-3 学术检索配置与验证

环境变量（key 绝不写入仓库）：

```bash
SEMANTIC_SCHOLAR_API_KEY=...   # 可选，提升 Semantic Scholar 限流
OPENALEX_MAILTO=you@example.com  # 可选，进入 OpenAlex polite pool
SEARCH_TOP_N=15                # 可选，论文卡片数量，默认 15
SEARCH_PER_QUERY=25            # 可选，每个查询每源取多少条，默认 25
```

两个源都不配 key 也能跑通；配 key / mailto 后速度更稳。

真实端到端验证（服务已启动且进程带 OPENCODE_GO_API_KEY）：

```bash
node scripts/verify-m2-3.mjs
```

脚本会检查：`research-cards.md` 是否生成、`02-research.md` 是否含不少于 10 张论文卡片、是否包含检索概览与失败源说明，以及 papers 表行数变化。

## M2-4 证据引用验证

真实端到端验证（服务已启动且进程带 OPENCODE_GO_API_KEY）：

```bash
node scripts/verify-m2-4.mjs
```

脚本在 M2-3 检查基础上增加：`03-draft.md` 引用编号数不少于 5 且全部在卡片范围内、包含参考文献列表；`citation-lint.md` 自动生成；`04-review.md` 包含可信引用清单、存疑引用与原因、覆盖不足的方向。

## M2-5 工作流 UI 启动与验证

普通模式（需要 OPENCODE_GO_API_KEY）：

```bash
npm.cmd run dev
```

访问 http://localhost:5173。

演示模式（无需 key）：

```powershell
$env:DEMO_MODE='1'
npm.cmd run dev
```

WebSocket 通道为 `ws://localhost:3000/ws`，开发时经 Vite 代理 `/ws` 到 5173。

验证路径：浏览器新建工作流 → 启动 → 步骤时间线推进 → 产物标签预览 → 审批 → completed。

## 审批操作说明（M2-6）

- 通过：接受当前产物，进入下一步
- 打回修改：必须填写修改意见；目标步骤及其后续步骤会用新版本重跑，意见注入模型 prompt；Reviewer 打回时回到 Writer 改稿再重审
- 取消任务：显式放弃整个任务（有确认提示），与“打回修改”无关
- 迭代产物以 v1 / v2 累积，标签页可回看历史版本

迭代闭环验证（真实模型）：

```bash
node scripts/verify-m2-6.mjs
```

## M2-7 规划与检索配置

```bash
PI_MODEL_PLANNER=...        # 可选，覆盖 planner 模型；默认 flash
SEARCH_MAX_GROUPS=10        # 可选，关键词组上限，默认 10
SEARCH_COMPENSATE_PER_QUERY=50  # 可选，打回后每查询条数，默认 50
SEARCH_MIN_CITATIONS=0      # 可选，打回后引用数下限，默认 0
CROSSREF_MAILTO=you@example.com  # 可选，进入 Crossref polite pool
```

规划与检索验证（真实模型）：

```bash
node scripts/verify-m2-7.mjs
```

## 常见问题

- 端口被占用：设置环境变量 `PORT`（server）或修改
  `apps/web/vite.config.ts` 的 `server.port`
- 浏览器显示“后端未连接”：确认 3000 端口已启动，或检查 Vite 代理配置
