---
title: 产物排版体系（MarkdownView 升级：标题层级 / 表格 / 分隔线 / 文档感）
status: active
created: 2026-08-28
updated: 2026-08-28
kind: ux
priority: high
triage: needs-plan
areas: [web]
depends_on:
  - "docs/issues/open/2026-08-28-ui-design-review.md"
---

# 产物排版体系（MarkdownView 升级）

> 总纲：[2026-08-28-ui-design-review.md](2026-08-28-ui-design-review.md) 专项 2

## 背景

产物 markdown 是用户消费的核心内容（检索计划 / 综述初稿 / 审查意见），但渲染器
`MarkdownView.tsx` 只有骨架没有排版，截图实证四大硬伤：

1. **标题无层级**：`MarkdownView.tsx:82` h1–h4 同一 class（`mt-3 mb-1 font-semibold`），
   ui-detail.png 中"锚点修订 / 研究问题 / 锚定点"与正文仅靠粗细区分，文档骨架不可见；
2. **表格零样式**：`MarkdownView.tsx:100-105` 只给 `min-w-[560px] border-collapse`，
   th/td 无边框、无内边距、无表头底色——ui-paused.png 锚点表格与 ui-approval2.png 的
   Claim–Evidence Map 列内容挤作一团，完全不可读（**演示最穿帮点**）；
3. **`---` 分隔线字面渲染**：渲染器不认识 hr，ui-detail.png 中 "----" 以文本形式出现在
   锚点修订标题前；
4. **无"文档感"**：`index.css:33` 定义了 `--font-serif`（Georgia/Songti）却只用于 logo
   副标题；综述初稿标题、引言、正文一个字号一个行距，没有"这是篇被设计的文章"的感觉。

## 目标

给产物内容建立排版体系：可扫读的标题阶梯、可读的表格、正确的 hr，综述初稿呈现"出版物"质感。

## 范围（做）

- MarkdownView 增加类型化样式层（保持现有安全白名单渲染器，不引依赖）：
  - 标题阶梯：h1（`text-[17px] font-bold` + 顶部留白 + 墨色）/ h2（15px semibold）/
    h3（14px semibold text-ink2）/ h4（13px semibold text-ink2），首个标题去顶边距；
  - hr：`<hr>` 渲染为 `border-line-soft` 细线 + 上下留白；
  - 表格：容器横向滚动 + 圆角边框包覆，th（bg-surface2 + semibold + px-3 py-2）/
    td（border-t border-line-soft + px-3 py-2 + align-top），tbody 斑马纹（odd:bg-surface2/40）；
  - 有序列表支持（当前只有 ul，`1. 2.` 列表也渲染成 disc）；
  - blockquote 加 bg-surface2/50 圆角衬底；
  - 行内 code / 代码块加底色与等宽字体样式；
- 综述初稿（03-draft.md）专属"文档模式"：容器加 `font-serif` 正文 + 更大行高 +
  首行标题用衬线大字（写作气泡内识别 ROLE_ARTIFACT 已具备条件，ChatFlow.tsx:108）。

## 不做

- 不换 markdown 渲染库（marked / react-markdown 等，保持零依赖与 XSS 白名单）；
- 不做目录跳转 / 阅读进度（后续增强）。

## 验收标准

- [ ] ui-detail / ui-paused / ui-approval2 三张截图场景重拍：标题三级可见区分、
      表格全对齐可读、无 "----" 字面文本；
- [ ] 有序列表正确渲染数字；
- [ ] 综述初稿以衬线文档模式呈现，与计划/报告卡有可感知的差异；
- [ ] 既有 web 测试全绿；MarkdownView 新增单测（hr / ol / 表格样式类）。
