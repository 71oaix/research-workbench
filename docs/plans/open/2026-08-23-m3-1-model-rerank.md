---
title: M3-1 模型精排（plan）
status: active
created: 2026-08-23
updated: 2026-08-23
issue: "docs/issues/open/2026-08-23-m3-1-model-rerank.md"
areas: [server, web]
---

# M3-1 模型精排（plan）

## 任务摘要
让入选卡片按"与原查询的细粒度相关度"做模型精排：升级 selector 输出排序评分表（分数+理由），服务端解析生成 `rerank-report.md` 并据此排序卡片，作为写作/评估/导出依据。

## 为什么做
M2-15 selector 只给"高/部分"分级，最终排序≈候选池顺序+简单加权；m2-13-effect-audit 将"模型精排"列为 M3 首位（边缘论文进池、相关度 0.10、排名失真）。华为赛题 3.1(3) 明确要求"细粒度相关性评估 + 输出排序后的最终列表"。这最贴近赛题评分、评委最能看懂。

## 预计效果
- 入选卡片带 0-100 相关度分数 + 一句话理由，按分数降序；
- 写作/评估/导出读到精排顺序；`rerank-report.md` 可回溯；
- 一组真实目标可看到精排前后排序差异（量化记录）。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 实现位置 | 升级 selector 同一次模型调用，末尾输出"相关度排序"表 | 新增独立 reranker 角色/步骤 | 不加角色避免盲改工作流；selector 已读全部卡片，正好精排 |
| 解析 | 服务端从 selector 输出提取 `| N | score | reason |` 表，生成 `rerank-report.md` | 让 writer 自行读乱序 | 确定性、可测试、可回溯 |
| 排序应用 | `rerank-report.md` 记录顺序；卡片文件保持原编号，写作以精排顺序为准 | 重排 research-cards.md | 重排会改写卡片文件、影响编号一致性，风险大 |

## Review 发现与修正
- [major] 模型输出表格式常漂移 → 修正：服务端宽容解析（行内数字+理由即可），缺失行跳过并记录。
- [major] 精排分数 vs 现有"高/部分"分级冲突 → 修正：精排分数只是排序依据，保留分级标签；报告中两者并列。
- [minor] writer 需读到精排 → 修正：`buildWriterSection` 注入精排顺序摘要。

## 实现步骤
1. `prompts.ts` selector 提示：末尾新增"## 相关度排序"小节（入选卡片 `| 编号 | 分数(0-100) | 理由 |`，按分数降序）。
2. 新增 `parseRerankReport(selectorMd)`：提取排序表 → `{id, score, reason}[]`。
3. selector step 提交时生成 `rerank-report.md`（并 emit artifact）。
4. `buildWriterSection` 注入精排顺序摘要。

## 测试与验证
- 单测：`parseRerankReport` 正常解析/格式漂移容错/缺失行跳过；writer 注入包含精排顺序。
- 复现：`npm run typecheck && npm test`；可选一次真实运行看 `rerank-report.md`。

## 验收标准
- [ ] `rerank-report.md` 含每入选卡片分数+理由，降序
- [ ] writer/evaluator 依据精排顺序
- [ ] 格式漂移容错（不崩）
- [ ] typecheck/test 全绿

## 文档更新清单
- `docs/guide/runbook.md`：rerank-report 说明。

## 涉及 UI/预览
产物新增 `rerank-report.md`；本地 `http://localhost:5173` 可在检查器看到。
