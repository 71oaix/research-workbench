---
title: M2-3 学术检索工具（Semantic Scholar / OpenAlex 真实论文卡片）
status: archived
created: 2026-08-14
updated: 2026-08-14
kind: feature
priority: high
triage: actionable
areas: [server, data, shared]
depends_on:
  - "docs/issues/close/2026-08-14-m2-2-pi-runtime.md"
resolution_plan: "docs/plans/open/2026-08-14-m2-3-academic-search.md"
---

# M2-3 学术检索工具

## 背景

M2-2 已让 Planner 用真实模型生成检索计划，但 Researcher 目前只是占位提示词。M2-3 给它接入真实学术检索：从计划中提取检索词 → 调 Semantic Scholar / OpenAlex → 去重排序 → 论文卡片 → 入库 papers 表 → 模型整理成 `02-research.md`，为 M2-4 Writer 提供可引用的证据来源。

## 目标

Researcher 步骤产出真实论文卡片（标题 / 作者 / 年份 / DOI / URL / 引用数 / 摘要），论文落库且可去重；检索链路确定性强（服务端代码执行，不依赖模型自己调工具）。

## 范围（做）

- `apps/server/src/search/`：
  - `AcademicSearchClient` 抽象（`search(query, limit) → Paper[]`）
  - `SemanticScholarClient` / `OpenAlexClient`：统一字段归一化、超时、429 / 错误处理、单源失败自动兜底
  - 关键词提取：从 `01-plan.md` 解析检索关键词（正则，最多 3 组）
  - 合并去重：DOI 优先，其次标题归一化；按引用数排序取前约 15 篇
- 论文入库：复用 `papers` 仓储 upsert（source + externalId 唯一）
- `PiStepRunner` 的 researcher 分支：检索 → 生成论文卡片 markdown → 注入 prompt → 模型整理输出 `02-research.md`（精简）
- 测试：search client（mock HTTP）、关键词提取、去重排序、researcher 分支（mock search）
- `scripts/verify-m2-2.mjs` 扩展真实检索验证

## 不做（明确排除）

- 引用级证据抽取 / 精读（M2-4 或后续）
- PDF 全文解析
- 向量检索 / pgvector（M3）
- 中文学术库（CNKI）
- 让模型自主调用检索工具（M2-3 用确定性检索管道，工具化后置）

## 验收标准

- [ ] Researcher 步骤真实检索 Semantic Scholar + OpenAlex，`02-research.md` 含 ≥8 张论文卡片（标题 / 年份 / DOI / URL / 引用数）
- [ ] 论文写入 `papers` 表，重复检索不产生重复行（source + externalId 去重）
- [ ] 单源失败时另一源兜底；全部失败返回明确错误并置 workflow `failed`
- [ ] 全流程：Planner 计划 → 审批 → Researcher 真实检索 → Writer / Reviewer 占位 → 审批 → completed
- [ ] typecheck / test 全绿；runbook 与 verify 脚本更新

## 关联

- 依赖：M2-2（已合并）
- 后续：M2-4 Writer / Reviewer 证据引用 → M2-5 工作流 UI
