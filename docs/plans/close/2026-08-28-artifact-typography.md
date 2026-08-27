---
title: 产物排版体系（plan）
status: archived
created: 2026-08-28
updated: 2026-08-28
issue: "docs/issues/close/2026-08-28-artifact-typography.md"
areas: [web]
---

# 产物排版体系（plan）

## 任务摘要
升级 MarkdownView 渲染层：标题四级阶梯、表格完整样式、hr/ol 支持、引用块与代码样式，
并为综述初稿（03-draft.md）启用衬线"文档模式"。

## 为什么做
产物 markdown 是核心消费内容，但渲染器只有骨架：h1–h4 同 class（MarkdownView.tsx:82）、
表格 th/td 零样式、`---` 渲染为字面文本、有序列表渲染成圆点；定义了 `--font-serif`
却未用于正文产物。演示中计划/草稿/审查报告的观感直接拉低专业度。

## 预计效果
- 任何产物一眼可见文档骨架；表格可读；
- 综述初稿呈现"出版物"质感，与其他产物形成可感知的类别差异。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 样式载体 | `.md-body` 作用域原生 CSS（index.css） | 长串 Tailwind class 拼接 | 渲染器输出 HTML 字符串，作用域 CSS 可维护、可测试、避免 purge 问题 |
| 渲染器 | 保持自写白名单实现 | 引入 marked/react-markdown | 零依赖 + XSS 白名单是既有安全决策 |
| 文档模式 | MarkdownView 加 `doc` prop，仅 03-draft.md 启用（font-serif + 行高 + h1 衬线大字） | 全部产物衬线 | 报告/计划是"工作文档"，草稿是"文章"，类别需要视觉区分 |
| hr 识别 | `---`/`***`/`___` 独立行 → `<hr>` | 仅 `---` | markdown 规范 |
| 有序列表 | `^\d+[.)]\s` → `<ol>` 独立状态机 | 复用 ul | 语义正确 |

## Review 发现与修正
- [minor] 渲染器旧的内联 Tailwind class 会与 .md-body 作用域样式并存漂移 → 修正：实现时
  同步剥离标题/表格/列表/引用/段落的旧 utility 字符串，样式单一来源收敛到 index.css。
- [minor] coverage-matrix.md 经 MarkdownView 渲染将继承 .md-body（含表格样式）→ 确认为
  预期行为（覆盖矩阵表格正是重灾区），写入计划避免 review 意外。

## 实现步骤
1. `index.css`：新增 `.md-body` 作用域样式——
   - h1(17px/700/mt-6) h2(15.5px/600) h3(14px/600 text-ink2) h4(13px/600 text-ink2)，
     首个标题 mt-0；p 行高 1.75；strong 700；
   - table：外层 `.md-table-wrap`（overflow-x-auto + border rounded + bg-surface），
     th(bg-surface2 semibold px-3 py-2) td(border-t px-3 py-2 align-top) tbody odd 底色；
   - hr：细线 + 上下 16px；ol list-decimal；blockquote 衬底圆角；code/pre 底色等宽；
2. `MarkdownView.tsx`：
   - hr 分支（独立行 `---+`/`***+`/`___+`）；
   - 有序列表分支（含 closeOl 与块级互斥清理）；
   - 表格输出包 `.md-table-wrap`；
   - 新增 `doc?: boolean` prop：容器加 `.md-doc`；
3. `ChatFlow.tsx`：renderContent 对 `03-draft.md` 传 `doc`；
4. `PaperCards.tsx` 不动（卡片已是结构化渲染）。

## 测试与验证
- `test/MarkdownView.test.tsx` 新增：hr 渲染 `<hr>`；`1. 2.` 渲染 `<ol><li>`；表格含
  `.md-table-wrap` 与 th/td；`doc` 产生 `.md-doc`；既有 XSS 测试保持通过；
- 截图复验：用 CDP 脚本重拍 ui-detail（计划 v2）/ ui-approval2（Claim–Evidence Map 表格），
  确认层级与表格对齐；
- typecheck + web test 全绿。

## 验收标准
- [ ] 标题 1–4 级视觉可辨；首个标题无顶边距
- [ ] Claim–Evidence Map 等表格全对齐（边框/表头底/斑马纹/内边距）
- [ ] 无 "----" 字面文本
- [ ] 有序列表显示数字编号
- [ ] 综述初稿衬线文档模式，与计划卡可感知差异
- [ ] typecheck / test 全绿
