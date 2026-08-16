---
title: M2-11 真实案例复盘修复（全文提取、流程恢复、核验误报、评估指标、产物呈现）
status: active
created: 2026-08-16
updated: 2026-08-16
kind: feature
priority: high
triage: actionable
areas: [server, data, web]
depends_on:
  - "docs/issues/open/2026-08-16-m2-10-review-evaluation.md"
---

# M2-11 真实案例复盘修复

## 背景

以最新真实案例 `8ad4d06b`（研究下多智能体的记忆架构）复盘：14:32 检索并下载 PDF 但全文全部未入库；14:37 草稿 v1 只基于摘要；14:54 用户打回（“写的稀巴烂，全靠摘要怎么写？”）；14:55 草稿 v2 重写后通过；14:56 之后 Reviewer 卡死 8 小时未产出 `04-review.md`。逐项核对数据库、PDF 文件、pi 会话记录与前端代码后，整理出以下问题。

## 问题清单（按严重度）

### P0-1 全文提取全部失败（pdf-parse 导入即崩）

- 现象：`data/pdfs` 已下载 7 个 PDF，但 `papers.full_text` 全为空，无 `paper-fulltext.md`，卡片全部标注“仅摘要”，Writer 只能靠摘要写。
- 证据：`node_modules/pdf-parse/index.js` 用 `module.parent` 判断调试模式，ESM 动态导入时 `module.parent` 为空，触发 `fs.readFileSync('./test/data/05-versions-space.pdf')`，文件不存在直接抛 `ENOENT`；`fullText.ts` 的 `await import('pdf-parse')` 因此永远失败。
- 验证：直接 `import('pdf-parse/lib/pdf-parse.js')` 成功提取 10 万字符文本（已实测）。
- 修复方向：`fullText.ts` 改为导入 `pdf-parse/lib/pdf-parse.js`；加一条真实 PDF 提取的单测防回归。

### P1-1 Reviewer 卡死且无恢复机制

- 现象：`8ad4d06b` 的 reviewer（`9bddb6d9`）14:56 起 running 至今，`04-review.md` 未生成，pi 会话文件不存在；另有两个 8-14 遗留 workflow 也是 executing 卡死。
- 根因：引擎把步骤置 running 后调用模型，进程中断/重启或调用挂起时没有超时与恢复；server 重启后 running 步骤永不结束。
- 修复方向：启动时把 `running` 步骤重置为 `failed`（或 `pending` 重跑）；`PiRuntimeHandle.send` 增加超时；失败时 workflow 明确 `failed` 并返回可读错误。

### P1-2 引用核验对 arXiv DOI 误报 Critical

- 现象：`citation-verification.md` 中 [3][5][6][9][15] 全被标 “标题与 Crossref 记录不一致（相似度 0.00），疑似引用指向错误论文”，实际这 5 篇都是 `10.48550/arxiv.*` 的 arXiv DOI，Crossref 返回记录与论文标题无法匹配，属误报。
- 修复方向：arXiv DOI 跳过 Crossref 或改用 arXiv API / 标题匹配；无法核验时标 `Unverifiable`，不得降级为 `Needs fix`。

### P1-3 引用核验报告计数显示 “Unverifiable undefined”

- 现象：汇总行 `Unverifiable undefined`，`countBy` 对缺失 key 返回 `undefined`。
- 修复方向：计数默认补 0，并加单测。

### P2-1 评估报告指标失真

- 现象：`evaluation-report.md` 平均相关度 0.04（Jaccard 分母过大，无区分度）；大纲覆盖 1 / 38（把 plan 大纲的子节也算入且与草稿章级标题对不上）；来源失败显示“无”，但 `research-cards.md` 实际有 19 个失败源。
- 根因：相关度用 400 字符摘要 bigram 全集做 Jaccard；大纲把子节条目全部计数；失败源从证据池 `cardsMd` 解析（格式不含失败源行），应解析原始 `research-cards.md`。
- 修复方向：相关度改用主题词命中比例；大纲覆盖只在章级比较；失败源从原始卡片解析；三处加单测。

### P2-2 产物呈现混乱、无版本差异、无文件说明

- 现象：`ArtifactTabs` 的排序名单缺 `paper-fulltext.md` / `citation-verification.md` / `evaluation-report.md`；03-draft v1/v2 是两个独立标签，无 diff；所有产物直接以原始 Markdown 堆在 `pre` 块，无“这个文件是什么、给谁看”的说明；全文几万字符混在标签里。
- 用户诉求：能直接看到两版草稿“改了什么”（diff / 变更说明），知道每个产物是干嘛的。
- 修复方向：产物分组成“规划 / 证据 / 草稿 / 审查”；同一产物多版本支持 diff 视图；每个产物带一句话用途说明；全文改为折叠或链接。

### P2-3 检索质量：弱相关论文进 top、去重存疑、失败源多

- 现象：`research-cards.md` 命中 / 去重 58 / 58（未看到合并效果）；top-15 混入明显不相关论文（[4] GUI 测试、[14] 运动规划）；失败源 19 个。
- 修复方向：核对去重为何未合并（跨源同论文）；卡片排序在引用数之外加入主题相关度；失败源统计要能归因到关键词/源并给出补偿效果。

### P3-1 引用解析“提及即引用”

- 现象：草稿 v2 正文写“与主题相关性较弱的 [4] 与 [14] 未纳入论述”，[4][14] 被 lint / 核验当作正式引用处理。
- 修复方向：明确“提及”与“引用”的判定（如 `[n]` 在句内作为引用 vs 讨论性提及），或人工标注。

### P3-2 同名工作流混淆导致 step_not_found

- 现象：页面上两个同名“研究下多智能体的记忆架构”工作流，前端把 A 工作流的 workflowId 与 B 工作流的 stepId 拼在一起发请求，后端返回 `step_not_found`。
- 修复方向：前端 `decide` 使用步骤自带的 `workflowId`（而非全局 selectedId）；列表对同名工作流展示创建时间/状态做区分。

## 范围（做）

- 修复 P0-1（pdf-parse 导入）+ 防回归单测。
- 修复 P1-1（running 恢复 + 超时 + 失败可见）。
- 修复 P1-2 / P1-3（arXiv DOI 核验策略 + 计数补零）。
- 修复 P2-1（评估指标三处）。
- 修复 P2-2（产物分组 + diff + 用途说明）。
- P2-3 / P3-1 / P3-2 按实现成本评估后决定本轮或 M3。

## 不做

- 草稿质量本身（写作质量提升另立 issue）。
- 多审查者隔离、六维完整评分（留 M3）。

## 验收标准

- [ ] 真实 PDF 能提取全文入库，卡片正确标注“已读全文”，单测覆盖 pdf-parse 加载路径
- [ ] server 重启后无悬挂 running；模型调用超时给出明确失败
- [ ] 引用核验对 arXiv DOI 不再误报 Critical，报告计数无 undefined
- [ ] 评估报告相关度 / 大纲覆盖 / 来源失败三项与原始数据一致
- [ ] UI 产物分组清晰、同产物多版本可看 diff、每个产物有用途说明
- [ ] typecheck / test 全绿
