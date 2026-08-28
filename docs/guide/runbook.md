---
title: 本地运行手册（runbook）
status: active
created: 2026-08-14
updated: 2026-08-17
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
SEMANTIC_SCHOLAR_API_KEY=...   # 可选，提升 Semantic Scholar 限流（申请：https://www.semanticscholar.org/product/api#api-key-form）
OPENALEX_API_KEY=...           # 可选但强烈建议：OpenAlex 2026-02 起强制 key（免费注册，$1/天免费额度，申请：https://openalex.org/users/me）
OPENALEX_MAILTO=you@example.com  # 可选，进入 OpenAlex polite pool
SEARCH_TOP_N=15                # 可选，论文卡片数量，默认 15
SEARCH_PER_QUERY=25            # 可选，每个查询每源取多少条，默认 25
SEARCH_COMPENSATE_ON_DEGRADE=true  # 可选，源稳定失效时对存活源补偿检索，默认 true
SEARCH_DEGRADE_COOLDOWN_MS=300000  # 可选，失效源冷却期（毫秒），默认 300000（5 分钟）
```

源状态说明（2026-08 实测）：

- **OpenAlex 已改为计费制（2026-02-24 起）**：需注册免费 key（`OPENALEX_API_KEY`，
  申请入口 https://openalex.org/users/me ），每个 key 每天约 $1 免费额度
  （search $0.001/次、list $0.0001/次），对本项目演示绰绰有余；无 key 时启动警告一次，
  额度不足时返回 429 `Insufficient budget`，系统把这类 429 识别为"非可重试"，
  快速失败并自动把该源的任务补偿到存活源，不再做无谓重试；
- **Semantic Scholar 无 key 时降级为 T3**（单次尝试、零重试，失败计为降级而非失败），
  建议申请免费 key（https://www.semanticscholar.org/product/api#api-key-form）后自动升 T1；
- 配 key / mailto 后速度更稳；稳定失效的源进入冷却期（默认 5 分钟）自动跳过并定时重探；
- IEEE Xplore 也有免费个人 API key（https://developer.ieee.org ），
  目前未接入 provider，仅作为未来扩展预留。

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
SEARCH_MAX_GROUPS=8         # 可选，关键词组上限，默认 8（M2-12 起）
SEARCH_SOURCE_CONCURRENCY=3 # 可选，每数据源并发请求数，默认 3（M2-12 起）
SEARCH_COMPENSATE_PER_QUERY=50  # 可选，打回后每查询条数，默认 50
SEARCH_MIN_CITATIONS=0      # 可选，打回后引用数下限，默认 0
CROSSREF_MAILTO=you@example.com  # 可选，进入 Crossref polite pool
SEARCH_READ_TOP=8              # 可选，全文阅读篇数，默认 8
SEARCH_FULLTEXT_MAX=20000      # 可选，每篇全文截断字符数，默认 20000
```

规划与检索验证（真实模型）：

```bash
node scripts/verify-m2-7.mjs
```

M2-8 全文与证据闭环验证（真实模型）：

```bash
node scripts/verify-m2-8.mjs
```

## M2-9 引用核验配置与验证

引用核验使用多源交叉：DOI 走 Crossref lookup、arXiv 论文走 arXiv lookup（6s/次限流 + 429 退避），无 DOI 时回退标题 + 第一作者检索（Crossref → Semantic Scholar 兜底）；结果按 DOI/arXiv 内存缓存（TTL 24h，负结果 1h），逐条核验并发 ≤ 3。

```bash
CROSSREF_MAILTO=you@example.com  # 可选，进入 Crossref polite pool
```

引用核验验证（真实模型）：

```bash
node scripts/verify-m2-9.mjs
```

脚本会检查：reviewer 阶段生成 `citation-verification.md`（含汇总与逐条核验），且 `citation-lint.md` 仍在。

## M2-10 审查与评估配置与验证

```bash
EVALUATION_TOPIC_GATE=0.4  # 可选，主题匹配门禁阈值（0-1），默认 0.4
```

审查与评估验证（真实模型）：

```bash
node scripts/verify-m2-10.mjs
```

脚本会检查：`04-review.md` 含 Concern Ledger（`### C{n}` 五要素），`evaluation-report.md` 含主题匹配 / 平均相关度 / 大纲覆盖 / 来源失败。

## M2-11 真实案例修复配置与验证

```bash
PI_STEP_TIMEOUT_MS=300000  # 可选，单步模型调用超时（毫秒），默认 300000
```

真实流程验证（全文进库 + 核验无误报）：

```bash
node scripts/verify-m2-11.mjs
```

脚本会检查：research-cards 标注“全文：已读 ≥ 1”、存在 `paper-fulltext.md`、`citation-verification.md` 不含 undefined。

## M2-12 可靠性与性能加固配置与验证

```bash
PI_THINKING_LEVEL=xhigh      # 可选，角色思考强度，默认 xhigh（DeepSeek reasoning_effort=max）
PI_THINKING_PLANNER=...      # 可选，按角色覆盖（off/minimal/low/medium/high/xhigh）
PI_THINKING_RESEARCHER=...
PI_THINKING_WRITER=...
PI_THINKING_REVIEWER=...
SEARCH_SOURCE_CONCURRENCY=3  # 可选，每数据源并发请求数，默认 3
SEARCH_MAX_GROUPS=8          # 可选，关键词组上限，默认 8
```

说明：

- 思考强度默认全部角色 `xhigh`（映射 DeepSeek `reasoning_effort=max`）。pi-ai 0.80.3 需要模型声明
  `thinkingLevelMap: { high: 'high', xhigh: 'max' }` 才会放行 xhigh，本项目已注册；成本较高时可用
  `PI_THINKING_<ROLE>` 按角色降级。
- 全文下载改为多候选依次尝试（arXiv → 期刊 OA），并发 ≤ 3，提取文本 ≥ 500 字符才算成功；
  每篇独立持久化 `download_status`（ok / no_oa / failed）与原因。
- Writer 只注入前 3 篇全文摘录（首 70% + 末 30%），其余论文仅摘要；打回重跑时草稿只注入结构摘要，控制上下文。
- 审批决策带乐观锁：重复/并发点击第二次返回 409 `step_not_awaiting_approval`。

验证（先跑离线检查，本地服务启动后加 `--live`）：

```bash
node scripts/verify-m2-12.mjs
node scripts/verify-m2-12.mjs --live
```

## M2-13 效果修复配置与验证

```bash
SEARCH_DOWNLOAD_MAX=25          # 可选，单次全量下载篇数上限，默认 25
SEARCH_DOWNLOAD_TIMEOUT_MS=240000  # 可选，下载阶段整体时间预算（毫秒），默认 240000
SEARCH_RELEVANCE_WEIGHT=2.0     # 可选，排序相关度权重，默认 2.0；设 0 恢复纯引用数排序
PI_MODEL_EVALUATOR=...          # 可选，evaluator 模型（默认 flash）
PI_THINKING_EVALUATOR=...       # 可选，evaluator 思考强度（默认 xhigh）
```

说明：

- 全文下载不再受 top-8 限制：有 OA 候选的卡片全部尝试（并发 3），时间预算内未完成标 timeout；
- 引用核验改用 arXiv `id_list` 批量（≤10/请求），失败回退 DOI / 标题搜索，Unverifiable 占比应显著下降；
- 评估由模型生成：新增 `evaluator` 角色（writer 后、reviewer 前，自动执行），
  规则统计只作参考输入，输出逐概念命中 / 逐卡相关度 / 大纲覆盖 / gap 建议；
- 检索排序加相关度加权，并过滤元数据损坏卡片（无年份 + 无 DOI/arXiv + 无作者，或作者字段异常超长）。

真实流程验证：

```bash
node scripts/verify-m2-13.mjs
```

## M2-14 检索召回与编号修复说明

- cs 域检索源：arxiv + OpenAlex + Crossref + Semantic Scholar（有 key 时 T1，无 key 时 T3 降级）；
- 源级熔断：某源连续失败 ≥3 次后停用该源剩余查询，失败源统计压缩为源级（如
  “semantic-scholar(T2) 失败 14 个查询，熔断跳过 2 个查询”），不再逐查询刷屏；
- arxiv 查询：纯中文查询跳过；>4 实词英文查询精简到前 3 实词；空结果依次放宽到前 2 词、首词；
- 全文编号：`paper-fulltext.md` 段落编号严格等于卡片编号，中间下载失败不占编号；
- 不可核验卡片：无年份 + 无摘要 + 无 DOI/arXiv 的卡片在管道端过滤（`skippedPapers` 可查）；
  有年份但无摘要的卡片保留并标注“摘要：缺失”。

真实流程验证：

```bash
node scripts/verify-m2-14.mjs
```

## M2-15 澄清、筛选与华为赛题性能吸收说明

```bash
SEARCH_CANDIDATE_TOP=40          # 可选，候选池规模，默认 40
SEARCH_MAX_GROUPS=10             # 可选，查询组上限（关键词 ∪ 子问题），默认 10（M2-15 起）
SEARCH_UNPAYWALL_EMAIL=you@example.com  # 可选，Unpaywall 兜底查询邮箱
PI_MODEL_SELECTOR=...            # 可选，selector 模型（默认 flash）
PI_THINKING_SELECTOR=xhigh       # 可选，selector 思考强度（默认 xhigh）
```

说明：

- 默认模板变六步：规划 → 检索 → 筛选 → 写作 → 评估 → 审查；筛选自动执行（无需审批）；
- 宽泛问题（如“研究下什么是 agent”）规划阶段会输出“## 澄清请求”，在审批意见中回答问题即可，
  下一轮计划会收敛锚点；
- 检索只产候选池（`research-candidates.md` / `.json`），由 selector 批量筛选后才下载全文，
  卡片带相关度分级与筛选理由，`selector-report.md` 可回溯剔除与二次检索；
- 引文雪球（OpenAlex cites / referenced_works）与 gap 二次检索会自动补充并重筛新候选；
- plan 含时间范围时 OpenAlex / S2 检索自动按年份过滤。

效果评测与成本报告（本地离线检索，无需模型 key）：

```bash
npx tsx scripts/eval-m2-15.mjs --limit 5
npx tsx scripts/eval-m2-15.mjs --out data/eval/report.md
npx tsx scripts/cost-report.mjs
```

真实六步流程验证（服务已启动且进程带 OPENCODE_GO_API_KEY）：

```bash
node scripts/verify-m2-15.mjs
```

脚本会检查：宽泛问题第一轮 plan 含“澄清请求”、六步完成、top-15 无明显无关论文、
卡片带相关度分级与筛选理由、全文编号与卡片一致。

## M2-16 归纳整理、writer 可选项与评测闭环说明

```bash
# 七步完整模板（含 writer）
node scripts/verify-m2-15.mjs

# 六步调研模板（无 writer，reviewer 输出证据调研审查）
node scripts/verify-m2-15.mjs --research
```

评测与成本（离线检索无需模型 key；LitSearch 拉取需要网络，失败可离线放置文件）：

```bash
npx tsx scripts/eval-m2-15.mjs --limit 5
npx tsx scripts/eval-m2-15.mjs --baseline --limit 5       # 全量版 vs 无迭代基线
npx tsx scripts/eval-m2-15.mjs --litsearch data/eval/litsearch-queries.jsonl
npx tsx scripts/fetch-litsearch.mjs --rows 30
npx tsx scripts/cost-report.mjs
```

说明：

- 最终交付物：`05-summary.md`（主题分组 + 相关度分级 + 引用清单）与 `references.bib`；
- 新建工作流时勾选“包含综述写作（Writer）”，不勾选即调研模板；
- 无 writer 时 evaluator/reviewer 自动降级（证据池覆盖 / 证据调研审查），不会因缺草稿报错。

## M3 产物与渲染说明（2026-08-23）

- `rerank-report.md`：selector 模型精排——入选论文按与原问题细粒度相关度排序（0-100 + 理由），writer 按此顺序组织论述，不改动卡片编号；
- `evaluation-scores.md`：确定性六维完整评分（0-5：主题匹配/相关度/大纲覆盖/引用可信/来源失败/完整性），供 evaluator 参考与前端展示；
- 评估/审查提示已升级：evaluator 输出六维分 + 完整性批评（该覆盖未覆盖方向），reviewer 输出覆盖缺口；
- 引用导出新增 `references-apa.md`（APA 风格）与 `references-gbt.md`（GB/T 7714），与 `references.bib`（BibTeX）并存；
- 前端产物用 `MarkdownView` 安全渲染（标题/列表/加粗/引用/代码块/表格），HTML 转义防 XSS；`.json`/`.bib` 仍用 `<pre>` 展示。

## M4 覆盖质量门与布局 v2 说明（2026-08-27）

- 布局 v2：中间为**对话流**（问题 → 规划 → 检索 → 筛选 → 写作 → 评估 → 审查 → 归纳，每步产物按气泡展示、卡片内版本 tab 切迭代），右侧为**执行进度（可点击跳转）+ 产出文件 tab**，左为导航；运行中步骤的"进行中"为轮换文学感字样 + 淡入动效；图标为自绘 SVG；
- `coverage-matrix.md`：覆盖质量门——计划子问题 → 支撑论文 → 覆盖/部分/缺失 → 缺口建议/相关推荐；缺失/部分会**自动触发缺口二次检索 + 重筛（≤2 轮）**，并给出相关推荐（无直接专论时标"以下最接近"）；
- 覆盖判定用双语关键词搭桥（中文子问题 vs 英文论文）；对同主题综述判定偏粗（多子问题被同批论文覆盖），精细区分需语义/向量检索（延后）；
- **v2 模型复核（2026-08-28）**：规则判为"部分/缺失"的子问题会批量送模型精判（selector 角色会话、无工具、仅输出 JSON，90s 超时），模型结论优先且过滤越界论文编号；judge 不可用/超时/解析失败时**静默回退规则结果**；判定升级后重算缺口清单再进 gap 回环。环境变量 `PI_JUDGE_TIMEOUT_MS` 可调超时；
- 澄清流程：规划出现"澄清请求"时，审批卡**无"通过"按钮**，用"提交回答并重新规划"（写答案）→ Planner 重跑生成完整计划。

## 常见问题

- 端口被占用：设置环境变量 `PORT`（server）或修改
  `apps/web/vite.config.ts` 的 `server.port`
- 浏览器显示“后端未连接”：确认 3000 端口已启动，或检查 Vite 代理配置
