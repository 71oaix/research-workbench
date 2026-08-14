---
title: 数据模型（M1）
status: active
created: 2026-08-14
updated: 2026-08-14
---

# 数据模型（M1）

> SQLite（`data/app.db`），仓储层抽象（`packages/data`），后续可换 PostgreSQL。

## 表

| 表 | 用途 | 关键字段 |
|----|------|----------|
| workflows | 工作流主表 | id, goal, status, created_at, updated_at |
| steps | 角色步骤 | id, workflow_id, label, role, status, input_artifacts, output_artifact, agent_runtime_id |
| artifacts | 角色间产物（版本化） | id, workflow_id, step_id, name, content, version |
| papers | 论文库（源 + externalId 唯一） | id, source, external_id, title, abstract, authors, year, doi, url, citation_count |
| decisions | 审批记录 | id, workflow_id, step_id, type, note |
| usage_records | token/成本审计 | id, workflow_id, step_id, role, input_tokens, output_tokens, cache_*, cost_cny |

## 设计要点

- 步骤状态机：pending → running → awaiting_approval → approved / rejected / skipped
- artifact 按 `(workflow_id, name)` 递增 version，支持审批 diff
- papers 用 `UNIQUE(source, external_id)` 做幂等 upsert
- 所有时间戳为 ISO 字符串；JSON 字段（authors / input_artifacts）存 TEXT

## papers 落库策略（M2-3）

- 每个检索源各自按 `(source, external_id)` 落库（S2 用 paperId，OpenAlex 用 work ID），重复检索不产生重复行
- 新增 `arxiv_id` 列（可空），用于跨源去重的中间键：DOI → arXiv ID → 归一化标题
- 跨源合并结果只存在内存与 `research-cards.md` artifact 中，不落库，保留每个源的 provenance

## 审批与迭代（M2-6）

- `steps` 表新增 `pending_feedback TEXT`：保存“打回修改”时用户填写的意见，步骤执行成功后清空
- 状态流转补充：`awaiting_approval` 收到 `modify` 后，目标步骤及其后续步骤重置为 `pending` 重新执行；`reject` 仍进入 cancelled
- 产物按 `(workflow_id, name)` 递增 version，迭代过程完整保留
