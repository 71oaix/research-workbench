---
title: M2-7 规划与检索质量（问题锚点 + 分级检索 + 补偿）
status: active
created: 2026-08-15
updated: 2026-08-16
kind: feature
priority: high
triage: actionable
areas: [server, data, shared]
depends_on:
  - "docs/issues/close/2026-08-14-m2-4-evidence-citation.md"
resolution_plan: "docs/plans/open/2026-08-15-m2-7-search-iteration-evidence-loop.md"
---

# M2-7 规划与检索质量

## 背景

真实运行「研究下多智能体的记忆架构」暴露：第一步拆解不够深、打回后检索不升反降（63/58 → 13/8）、Semantic Scholar 整组失败、OpenAlex 中文查询漂移、多 DOI 版本未合并。本任务收口“规划与检索”这一层，不延伸到全文、引用核验与评估（拆到 M2-8 / M2-9 / M2-10）。

## 目标

- 规划：默认 deepseek-v4-pro 深度拆解，产出“锚定点”，打回时先修订锚点再重查
- 检索：按源分级路由、关键词用足、查询构造有数量反馈、去重稳健、限流与错误可见
- 打回：真正改变检索策略（提高条数、引用数下限、补用未用关键词组），结果不劣于上一版

## 范围（做）

### 规划

- Planner 默认模型 `deepseek-v4-pro`（`PI_MODEL_PLANNER` 可覆盖）
- 计划新增“锚定点”小节（核心概念 / 方法 / 场景 / 时间范围）；打回时输出“锚点修订”再生成新计划

### 检索

- 源分级路由：T1（OpenAlex / arXiv / Crossref / 有 key 的 Semantic Scholar）→ T2（无 key 的 Semantic Scholar / bioRxiv / medRxiv）→ T3（抓取源，需警告）；按域选择源、单源失败独立记录并继续
- 关键词用足（最多 10 组），组内中英文拆分多个查询
- 查询构造：概念 → 同义词 → 布尔查询；结果量反馈（>500 收窄、<10 放宽）；排名策略 relevance / date / citation / 组合
- 去重引擎：DOI 主键 + 标题/首作者 Jaccard ≥ 0.90 兜底 + 合并偏好（完整元数据 > 出版源 > 引用数）
- 限流与 ToS：封装 client（arXiv 1 req/3s、S2 1/s 无 key / 100/s 有 key、Crossref 50/s、OpenAlex polite pool），429 退避 + 错误响应体回传；结果写文件、字段裁剪避免 context 溢出
- 打回补偿：feedback 非空时提高 per-query、启用引用数下限过滤、补用未使用关键词组
- 规范片段骨架：新增 manifest + fragments 的轻机制，承载上述检索规则（为后续 M2-9 / M2-10 复用）

## 不做

- 机构授权源（PubMed/CNKI）留 M3
- 全文下载与阅读（→ M2-8）
- 字段级引用核验（→ M2-9）
- 审查与评估报告（→ M2-10）

## 验收标准

- [ ] Planner 默认 v4-pro，输出含“锚定点”，打回后生成“锚点修订”
- [ ] 检索按源分级路由，单源失败降级并记录
- [ ] 打回后使用全部关键词组 + 补偿参数，结果数量与相关度不劣于上一版
- [ ] 去重通过 DOI + 标题/作者兜底，多 DOI 版本合并正确
- [ ] 每源 client 限流 + 错误体回传 + 结果写文件
- [ ] typecheck / test 全绿

## 关联

- 后续：M2-8 全文与证据 → M2-9 引用核验 → M2-10 审查与评估
