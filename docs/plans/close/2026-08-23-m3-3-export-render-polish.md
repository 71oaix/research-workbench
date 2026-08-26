---
title: M3-3 导出与渲染打磨（plan）
status: archived
created: 2026-08-23
updated: 2026-08-23
issue: "docs/issues/open/2026-08-23-m3-3-export-render-polish.md"
areas: [server, web]
---

# M3-3 导出与渲染打磨（plan）

## 任务摘要
让调研结果"可交付"：引用清单支持 APA 与 GB/T 7714 导出，产物 Markdown 在前端渲染成可读成品（替代纯 `<pre>`）。

## 为什么做
summarizer 目前只导出 Markdown + BibTeX；学术写作常用 APA/GB-T，缺格式显得交付不完整。前端产物是 `<pre>` 裸文本，标题/列表/加粗/引用全无，演示观感差。m2-13-effect-audit 将"页码级/APA·GB-T/渲染打磨"列为 M3。

## 预计效果
- 引用清单可从 Markdown/BibTeX/APA/GB-T 四种格式导出，字段正确；
- 产物 Markdown 正确渲染（标题/列表/加粗/引用/代码块/表格），不再只有 `<pre>`；
- 导出 UI 可切换格式。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 引用格式 | APA 与 GB/T 7714，生成独立 `references-*.md` | 合并进单一文件 | 格式互斥，独立文件最清晰 |
| Markdown 渲染 | 轻量安全渲染器（转义 HTML 后按白名单转 HTML） | 引入重型 MD 库/编辑器 | 产物是我们自己的文本，安全转义即可；不拖体积 |
| 触发 | summarizer step 同时生成 4 种引用产物 | 前端按需调用 | 保持服务端产物确定性，测试可复现 |

## Review 发现与修正
- [major] 直接 `dangerouslySetInnerHTML` 会有 XSS 风险 → 修正：先转义 HTML，再按白名单标签转换。
- [minor] GB-T 作者过多要加"等"截断 → 修正：作者 >3 人时 GB-T 用"第一作者 等"。
- [minor] 中文标题在 APA 中不加斜体 → 修正：APA 标题保持正文格式，不做斜体处理。

## 实现步骤
1. `summarizer.ts`：`buildReferencesApa` / `buildReferencesGbt(cards)`。
2. `EvidenceStepService.prepareSummarizer`：额外生成 `references-apa.md`、`references-gbt.md`。
3. web `MarkdownView.tsx`：安全 Markdown → HTML 渲染组件。
4. `ArtifactTabs` 调研结果组：支持格式切换（bib/apa/gbt/md）+ MarkdownView 渲染。

## 测试与验证
- 单测：`referencesApa`/`referencesGbt` 字段正确；MarkdownView 渲染标题/列表/加粗/引用/代码块；HTML 转义（`<script>` 被转义）。
- 复现：`npm run typecheck && npm test`。

## 验收标准
- [ ] APA/GB-T 导出字段正确（作者>3 用"等"截断，年份/标题/来源正确）
- [ ] 产物 Markdown 渲染正确、HTML 转义安全
- [ ] 导出 UI 可切换格式
- [ ] typecheck/test 全绿

## 文档更新清单
- `docs/guide/runbook.md`：导出格式说明。

## 涉及 UI/预览
产物渲染从 `<pre>` 升级为 MarkdownView；导出格式下拉。本地 `http://localhost:5173`。
