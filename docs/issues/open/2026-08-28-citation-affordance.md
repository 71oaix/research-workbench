---
title: 引用 [n] 可溯源交互（核心卖点可视化：标记化 + hover 预览 + 点击定位）
status: active
created: 2026-08-28
updated: 2026-08-28
kind: feature
priority: high
triage: needs-plan
areas: [web]
depends_on:
  - "docs/issues/open/2026-08-28-ui-design-review.md"
---

# 引用 [n] 可溯源交互

> 总纲：[2026-08-28-ui-design-review.md](2026-08-28-ui-design-review.md) 专项 3

## 背景

产品叙事是"每句引用可溯源、审查后带可信分级"，但 UI 对此**零表达**：综述初稿正文里的
`[2] [13] [14]` 与普通文本同色同字重、不可 hover、不可点击（截图 ui-approval2.png）。
评委/用户无法感知这是产品与"大模型直接生成综述"的本质差异。这是设计层面最大的
卖点缺口——不是缺功能，是缺"让卖点被看见"的呈现。

## 目标

让每一处引用在阅读时即可感知可溯：视觉上跳出来，交互上可追问，点击可抵达证据。

## 范围（做）

- 行内引用标记化（MarkdownView 安全白名单内扩展）：
  - 正文 `[n]` / `[2][13]` 连续组解析为 `<sup>` 标记组，样式区分
    （accent 色、小号、可点区 ≥20px），存疑引用（审查结论为 unsupported/inferred 的）
    叠加 warn/bad 色点——复用 04-review.md 的核验结论做红绿分级；
  - hover tooltip：显示对应论文标题 + 年份 + 可信等级（数据源：research-cards.md
    的编号卡片区，无需新接口）；
  - 点击：平滑滚动到同气泡内 research-cards 对应卡号并短暂高亮（outline 脉冲一次）；
- 跨气泡定位：引用所在气泡无证据卡时，点击走右侧"产出文件→证据卡片"跳转路径
  （复用 ArtifactFileTabs 的 scrollIntoView 机制）。

## 不做

- 不做 PDF 全文内嵌预览、不做悬浮卡上的摘要全文（tooltip 只到标题级）；
- 不改后端数据结构（核验分级从 04-review.md 文本解析，解析失败静默降级为统一样式）。

## 验收标准

- [ ] 综述初稿中所有 [n] 均渲染为可交互上标标记；
- [ ] hover 显示标题+可信级；点击定位到证据卡并高亮；
- [ ] 04-review 缺失或解析失败时降级为统一 accent 样式，无报错；
- [ ] XSS 回归：构造 `[<script>]` 类内容确认转义；既有测试全绿；
- [ ] 新增单测：引用解析、连续组合并、降级路径。
