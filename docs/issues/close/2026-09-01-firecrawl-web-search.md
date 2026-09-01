---
title: Firecrawl 网页搜索兜底（替代硬编码白名单的通用 web 搜索工具）
status: archived
created: 2026-09-01
updated: 2026-09-01
kind: feature
priority: urgent
triage: actionable
areas: [server]
resolution_plan: "docs/plans/close/2026-09-01-firecrawl-web-search.md"
---

# Firecrawl 网页搜索兜底（通用 web 搜索工具）

## 背景

selector 证据补位目前依赖**硬编码官方文档白名单**（AutoGen/LangGraph/CrewAI/Mem0/Letta/MetaGPT 8 个域），
仅对命中框架锚点的子问题抓取官方文档。这带来两个问题：

1. **覆盖面窄**：白名单外的工程实践类子问题（例如"多智能体记忆共享机制""Agent 记忆模块最佳实践"）
   学术文献天然稀疏，又没有官方文档锚点，覆盖缺口只能留空——录制视频时演示"工程实践无证据落地"会很难看；
2. **"白名单"观感差**：用户（评委视角）会问"为什么搜索是白名单？不会是硬编码吧？"
   ——这恰好是"可验证"叙事要避免的反例。智能体应当有真实的网页搜索工具。

调研结论（docs/research/2026-09-01-web-content-acquisition-survey.md 已记录）：业界主流的"抓网页数据"
方案即 **Firecrawl**（用户所述"firework/fire 抓网页"），v2 API 提供 `search`（网页搜索）与
`scrape`（单页转 Markdown）两个端点，免费层约 1000 credits/月，足以支撑演示。

> 注：用户曾以为"接了 DeepSeek API 它自带搜索工具"——实测 DeepSeek 官方 `/models` 返回仅
> `{id, owned_by}`，无服务端工具；工具调用 = 模型调用**我们注册**的工具，因此由代码确定性接入 Firecrawl
> 是本方案（而非模型自调工具，后者演示稳定性风险更高）。

## 目标

- 对**白名单未命中**、且学术文献覆盖稀疏的子问题，用 Firecrawl `search` 做真实 web 搜索兜底，
  命中任意权威网页（官方文档/博客/教程/仓库 README）作为 writer 参考素材；
- 白名单保持为确定性、免费的优先种子，Firecrawl 只负责覆盖不到的部分（并去重、白名单优先）；
- 保持预算纪律（免费层 ~1000 credits/月）：每行至多 1 次 search，description 足够长直接用，
  过短才对 top-1 做 1 次 scrape；
- key 通过 `.env.local` 注入（`FIRECRAWL_API_KEY`），不进仓库，缺失时静默降级为纯白名单。

## 范围（做 / 不做）

**做**
- `src/search/firecrawl.ts`：FirecrawlClient（search / scrape / 重试 / 预算截断）
- `src/search/officialDocs.ts`：`fetchWebDocs`（白名单未覆盖行的 web 搜索兜底）+ `mergeDocRefs`（去重、白名单优先）
- `src/search/SelectorStepService.ts`：commit() 中"白名单 → webFallbackRows → 合并"
- `src/search/config.ts`：`firecrawlApiKey` 配置项
- 证据卡新增"补充参考（官方文档 / 网页）"段，逐篇标注来源站点/URL/访问日期，不进引用编号与核验序列
- 测试：FirecrawlClient + fetchWebDocs + mergeDocRefs 单元测试
- 文档：runbook 配置说明、INDEX、本 issue/plan

**不做**
- 不做模型自调工具（noTools 保持 'all'，Firecrawl 由代码确定性调用）
- 不做白名单移除：白名单作为免费优先种子保留
- 不做多轮评估回环（沿用现有上限 1 次）
- 不做向量检索（仍延后）

## 验收标准

- [ ] typecheck / test 全绿（含 firecrawl.test.ts 8 例）
- [ ] 真实 key 端到端验证：uncovered 行搜索出权威网页、description 过短时 scrape 成功、预算截断生效
- [ ] 无 key 时静默降级为纯白名单，不阻塞主流程
- [ ] 补充参考段逐篇标注来源（站点/URL/访问日期），不进引用编号与核验序列
- [ ] runbook / INDEX 已同步
