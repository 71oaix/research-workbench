---
title: Firecrawl 网页搜索兜底（plan）
status: active
created: 2026-09-01
updated: 2026-09-01
issue: "docs/issues/open/2026-09-01-firecrawl-web-search.md"
areas: [server]
---

# Firecrawl 网页搜索兜底（plan）

## 任务解释

把 selector 证据补位从"纯硬编码官方文档白名单"升级为"白名单优先 + Firecrawl 真实网页搜索兜底"：
对白名单未命中、学术文献覆盖稀疏的子问题做真实 web 搜索，命中权威网页作为 writer 参考素材，
同时用预算纪律控制免费层额度。实现已完成并测试、真实 key 验证通过，本 plan 用于归档留痕。

## 为什么做

- 覆盖 8 个白名单域外的工程实践类子问题，避免"工程实践无证据落地"的演示缺口；
- 回答评委"为什么搜索是白名单？不会是硬编码吧？"——智能体具备真实搜索工具，支撑"可验证"叙事；
- 用户明确要求接入 Firecrawl（其 key 已提供）。

## 关键决策

| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 工具接入方式 | **代码确定性调用 Firecrawl**（search/scrape 两个 HTTP 端点） | 模型自调工具（noTools 放开） | 实测 DeepSeek 官方 /models 无服务端工具，工具=模型调我们注册的工具；代码调用演示稳定、可预算、可测试 |
| 白名单去留 | **保留为优先免费种子**，Firecrawl 覆盖白名单未命中行 | 完全移除白名单 | 白名单零成本、确定性、来源最权威（官方一手文档）；web 兜底只补缝隙 |
| 查询构造 | 中文子问题 + plan 双语关键词（前 6 个英文词）拼 query | 纯中文 query | 提升英文权威网页命中率（实测命中 AWS/Google 官方博客、zhihu、arxiv） |
| 摘要质量 | description ≥600 字符直接用，否则对 top-1 做 1 次 scrape | 全部 scrape / 全部用 description | 预算纪律：免费层 ~1000 credits/月，search ~1 credit、scrape ~1-5 credits |
| 每行预算 | ≤1 次 search（limit 4），取前 3 篇，每篇摘要 ≤2000 字符 | 多 search / 全量抓取 | 演示时间线内可控，缺口补足即可 |
| 失败语义 | 无 key/网络/超时静默跳过，降级为纯白名单 | 抛出阻塞主流程 | 补位是增强不是依赖 |
| 去重与优先 | mergeDocRefs：按行、按 url 去重，白名单优先 | 简单拼接 | 避免同源重复引用，官方文档优先于第三方网页 |
| 证据归属 | 新段"补充参考（官方文档 / 网页）"，不进引用编号与核验序列 | 并入证据池 | 保持引用核验的可验证性不受第三方网页污染 |

## 实现步骤（已完成）

1. `src/search/firecrawl.ts`：FirecrawlClient（构造校验 key、search 解析 web hits、scrape 转 markdown、
   429/5xx 重试 800*(n+1)ms、摘要截断 MAX_SCRAPE_EXCERPT_CHARS=2000）；
2. `src/search/officialDocs.ts`：`fetchWebDocs`（无 key 早退、跳过 covered、双语 query、
   description≥600 直用否则 scrape、hostLabel 标注站点、静默 catch）+ `mergeDocRefs`（url 去重白名单优先）
   + 渲染段标题改为"补充参考（官方文档 / 网页，不进引用编号与核验序列）"；
3. `src/search/SelectorStepService.ts`：commit() 先白名单，再对白名单未覆盖且非 covered 的行跑
   fetchWebDocs，最后 mergeDocRefs 合并、annotateDocRefs、cardsMd 渲染；
4. `src/search/config.ts`：SearchConfig 增加 `firecrawlApiKey`，从 `env.FIRECRAWL_API_KEY` 读取；
5. `.env.local` 增 `FIRECRAWL_API_KEY`（已 gitignore），`.env.example` 增注释占位；
6. `src/search/coverage.ts`：docNote 文案改为"已附补充参考 N 篇（见证据卡"补充参考"）"；
7. 测试：`test/search/firecrawl.test.ts`（8 例）+ `officialDocs.test.ts` 断言更新。

## 测试与验证（已完成）

- typecheck 全绿（`tsc --noEmit -p .`）；
- 全量 vitest：36 文件 / 185 例全绿；
- **真实 key 端到端**：`fc-6d90...63` 验证——
  - search "Mem0 memory layer architecture" 返回 4 hits（mem0.ai / GitHub / arxiv）；
  - scrape mem0.ai 返回 markdown（截断 2000 字符）；
  - fetchWebDocs 两行 uncovered：命中 AWS/Google 官方博客、zhihu 专栏，摘要均截断 ≤2000，
    短 description 行自动触发 scrape（预算路径验证通过）。

## 文档更新清单

- runbook：新增 Firecrawl 配置与说明段
- INDEX.md：新增本 issue/plan 行
- issues/open/2026-09-01-quality-loop-and-evidence-bar.md：反转"不做：通用 web 搜索接入"

## 验收标准

- [ ] typecheck / test 全绿
- [ ] 真实 key 端到端验证通过（search + scrape + 预算截断）
- [ ] 无 key 静默降级为纯白名单
- [ ] 补充参考段逐篇标注来源（站点/URL/访问日期），不进引用编号与核验序列
- [ ] runbook / INDEX 已同步
