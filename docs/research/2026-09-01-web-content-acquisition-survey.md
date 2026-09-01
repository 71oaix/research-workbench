---
title: 调研：Agent 如何获取与阅读网页/官方文档内容（行业实践）
status: active
created: 2026-09-01
updated: 2026-09-01
---

# 调研：Agent 如何获取与阅读网页/官方文档内容

> 背景：热身二暴露"框架实践类子问题学术文献天然稀疏"，计划引入官方文档作为证据补充（issue 2026-09-01 C 组）。本文调查行业做法，为 C 组实现定案。方法：WebFetch 直接抓取一手来源（搜索通道当日不可用）。

## 一、行业三层共识形态

各家的实现殊途同归，可归纳为三层：

| 层 | 职能 | 代表实践 |
|----|------|----------|
| L0 发现 | 找到"该读哪页"的结构化入口 | **llms.txt 规范**、sitemap |
| L1 抓取 | 拿到干净的正文 | fetch + **正文提取去噪**（trafilatura 类）或托管服务（Firecrawl/Jina） |
| L2 阅读 | 控制上下文预算 | 截断/分块/选页 + 引用回指（URL 可溯源） |

### L0：llms.txt / Markdown 页面惯例（重要发现）

[llmstxt.org v2 规范](https://llmstxt.org/)：站点在根路径或 docs 子路径放 Markdown 导览文件（H1 + 摘要 + 按主题分节的链接清单）；**v2 的关键变化是要求每个页面在同 URL 提供 Markdown 版**——追加 `.md`（如 `page.html.md`）或替换扩展名（`page.md`），并通过 `rel="alternate" type="text/markdown"` link 声明。

采纳规模：数千站点已发布；**OpenAI、Anthropic、Gemini 的开发者文档均已发布 llms.txt**；Mintlify、GitBook、Docusaurus/VitePress 等文档平台自动生成。AI 框架文档大量由 Mintlify 托管（Mem0、CrewAI 等），意味着**这些站点的页面很可能直接有 `.md` 版**——抓 Markdown 直取比抓 HTML 再提取干净一个量级（零导航噪声、结构保留）。

Agent 预期流程（规范原文）：查看 llms.txt → 定位所需信息 → 跟随链接获取详情。

### L1：正文提取

- **[trafilatura](https://trafilatura.readthedocs.io/en/latest/)**（Python 生态事实标准）：自研规则算法，jusText/readability-lxml 作后备；专门剔除页头/页脚/样板噪声，兼顾精确率与召回率；输出 TXT/Markdown/JSON；官方教程直接覆盖 RAG 管道场景；用户含 HuggingFace、IBM、Microsoft Research、NVIDIA、Allen AI、Stanford。
- **[Firecrawl](https://www.firecrawl.dev/)**（商业托管形态，175k stars）：search+scrape 一体、自动 JS 渲染、smart-wait；宣称去噪后**比原始页面省 93% 输入 token**、覆盖 96% 网页、P95 3.4s；免费层 1000 credits/月；默认遵守 robots.txt。
- Jina Reader（r.jina.ai URL→markdown 服务，同赛道；本次抓取超时未取到细节，定性为同类）。
- 启示：**去噪是硬需求**——省 93% token 的量级说明原始页面大部分是导航/样板；无 Python 运行时（本项目 Node）时的替代是"markdown 直取优先 + HTML 简化去噪兜底"。

### L2：阅读预算

行业没有"全量阅读"：Firecrawl 以"省 93% token"为卖点；学术论文管道（我们已有）也是"全文摘录前 3 篇/摘要 600 字符"的预算制。LLM 上下文喂原始网页是被证伪的做法。

### 第一方 Agent 工具的形态佐证

Anthropic web fetch tool（抓取被地区限制未取到全文，据公开介绍）：URL → 抓取 → 转 markdown → 上下文长度可配（max_uses/内容上限）→ 域限制可配。与上述三层一致：markdown 化 + 预算 + 域控制是共同设计。

## 二、对本项目 C 组的结论

1. **不做 web search 主路径**（DeepSeek API 无官方 search；即便有也无法限定白名单域、可核验性弱）——维持原判断；
2. **L0 优先：先探测 `.md` 版页面**（llms.txt v2 惯例），Markdown 直取失败再回退 HTML 提取——比原 plan"fetch HTML"更干净且实现更省（少写提取器的主路径）；
3. **L1 兜底**：HTML 简化去噪用 Node 内置实现（剥 script/style/nav/header/footer/aside，取最大文本块），不引入 Python 依赖；质量不足时提交后可升级 Firecrawl 免费层（1000 页/月）或 Jina；
4. **L2 纪律**：每缺口 ≤3 页、每页 ≤2000 字符，"官方文档参考"附加段（不进引用编号与核验序列）；
5. **合规**：仅白名单域（AI 框架官方 docs）、带 UA、失败即弃、标注访问日期。

## 三、来源

- [llmstxt.org（v2 规范）](https://llmstxt.org/)
- [trafilatura 文档](https://trafilatura.readthedocs.io/en/latest/)
- [Firecrawl 官网](https://www.firecrawl.dev/)
- DeepSeek API 能力边界：基于 api-docs.deepseek.com 公开资料与模型既有知识（2026-09-01 当日搜索通道不可用，未能实时复核；不影响结论——即便存在 search API 也不采用为主路径，理由见二.1）
