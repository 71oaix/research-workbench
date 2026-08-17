---
title: M2-8 全文获取与证据闭环（下载校验 + 证据池 + 全文写作）
status: archived
created: 2026-08-16
updated: 2026-08-16
kind: feature
priority: high
triage: actionable
areas: [server, data, shared]
depends_on:
  - "docs/issues/close/2026-08-15-m2-7-search-iteration-evidence-loop.md"
resolution_plan: "docs/plans/close/2026-08-16-m2-8-fulltext-evidence.md"
---

# M2-8 全文获取与证据闭环

## 背景

当前 writer 只拿到标题与截断摘要，没有“下载并阅读”全文，是写作质量差的直接原因；打回重跑还会出现证据版本错位（v1/v2 各自为证）。本任务让论文真正被下载、被读、被合并进证据池。

## 目标

- top-N 论文 OA 优先下载 PDF 并校验，全文入库
- 多版本证据卡片合并为“证据池”，writer / reviewer / lint 统一基于合并池
- writer 基于全文写作，引用必须落在证据池，输出附 claim-evidence map

## 范围（做）

- 全文模块：解析 PDF 地址（arXiv / S2 openAccessPdf / OpenAlex best_oa_location / Europe PMC OA），下载并提取文本，存入 `papers.full_text`；PDF 校验（非空、`%PDF`、可读），状态清单（downloaded / oa_not_found / no_authorized_pdf_found 等）与来源审计
- 证据池：`buildEvidencePool` 合并全部 research-cards 版本（去重 + 标注来源版本）
- 写作：writer 注入合并证据池 + top-N 全文（截断）；写前对齐门（一句话论点 + 段落图）；输出 claim-evidence map；强制纯数字 `[n]` 引用；未读全文的论文不得展开论点

## 不做

- 独立 Reader 角色与 16 节精读卡片（留 M3）
- publisher API / 机构授权会话（留 M3）
- 字段级引用核验（→ M2-9）

## 验收标准

- [ ] top-N 论文 OA 下载并校验，全文入库，失败论文标注“仅摘要”
- [ ] 证据池多版本合并去重，来源版本可见
- [ ] writer 引用全部落在证据池，产物含 claim-evidence map 与一句话论点
- [ ] typecheck / test 全绿

## 关联

- 依赖：M2-7
- 后续：M2-9 引用核验 → M2-10 审查与评估
