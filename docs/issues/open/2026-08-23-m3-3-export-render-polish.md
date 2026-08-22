---
title: M3-3 导出与渲染打磨：APA/GB-T 引用导出 + 产物 Markdown 渲染
status: active
created: 2026-08-23
updated: 2026-08-23
kind: feature
priority: low
triage: needs-plan
areas: [server, web]
---

# M3-3 导出与渲染打磨：APA/GB-T 引用导出 + 产物 Markdown 渲染

## 背景

M2-16 summarizer 已导出 Markdown + BibTeX 引用清单，但引用格式只有一种（BibTeX）；
学术写作常要求 APA 或 GB/T 7714，缺这一层会显得"交付物不完整"。另一方面，前端产物
（plan / 卡片 / 草稿 / 摘要）目前用 `<pre>` 纯文本呈现，标题、列表、加粗、引用、
代码块都是裸文本，观感一般，削弱"成品可交付"的演示效果。

## 目标

1. 引用清单导出支持 **APA** 与 **GB/T 7714**（在现有 Markdown + BibTeX 之上新增格式）；
2. 前端对产物 Markdown 做**基础渲染**（标题、加粗、列表、引用、代码块、表格），
   让产物从"原始文本"变成"可读的成品"。

## 范围（做）

- summarizer / 导出逻辑：按格式生成参考列表（APA / GB-T / 现有 Markdown + BibTeX）；
- web 端：轻量 Markdown 渲染组件（不引入重型编辑器），对产物内容做安全渲染
  （白名单标签，避免 XSS）；
- 导出 UI 提供格式选择。

## 不做

- 页码级核验（延后）；
- Word 导出（明确不做）；
- 全文 QA、向量检索（不在本轮）。

## 验收标准

- [ ] APA 与 GB/T 7714 两种引用格式导出可用，字段正确；
- [ ] 产物 Markdown 渲染正确（标题 / 列表 / 加粗 / 引用 / 代码块），`<pre>` 不再是唯一形态；
- [ ] 导出 UI 可选格式；
- [ ] typecheck / test 全绿。

## 关联

- 依赖：M2-16 summarizer（归纳整理 + 引用清单，已实现）。
- 证据：m2-13-effect-audit 第五节 M3 优先级 7。
