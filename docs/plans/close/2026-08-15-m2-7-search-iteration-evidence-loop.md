---
title: M2-7 规划与检索质量（问题锚点 + 分级检索 + 补偿）（plan）
status: archived
created: 2026-08-15
updated: 2026-08-16
issue: 2026-08-15-m2-7-search-iteration-evidence-loop
areas: [server, data, shared]
---

# M2-7 规划与检索质量（plan）

## 任务解释

把“规划”和“检索”升级为可分级、可补偿、可复现的确定性管道：Planner 保持稳定 flash 并产出问题锚点；检索按源分级路由、关键词用足、查询构造与去重稳健、限流与错误可见；打回时真正改变检索策略。

## 关键决策

| 决策点 | 选择 | 放弃 / 备选 | 理由 |
|--------|------|-------------|------|
| Planner 模型 | 保持默认 `deepseek-v4-flash`，`PI_MODEL_PLANNER` 覆盖入口保留 | 默认 v4-pro | Pro 仍在测试，先稳定；覆盖入口已具备，后续切换零代码 |
| 问题锚点 | 计划新增“锚定点”小节；打回时先“锚点修订”再重查 | 只改关键词 | 检索质量取决于问题锚定 |
| 源分级 | T1=OpenAlex/arXiv/Crossref/有 key 的 S2；T2=无 key 的 S2/bioRxiv/medRxiv；T3=抓取源（警告）；域→源 + 兜底链 | 双源平权 | 把可靠性编码，失败可降级可记录 |
| 关键词 | 全部组（上限 10），组内按 `/` 拆中英文多查询 | 只用前 3 组 | 真实运行证明前 3 组不够 |
| 查询反馈 | 命中 >500 收窄、<10 放宽；排名 relevance/date/citation/组合 | 固定参数 | 数量反馈是零成本确定性信号 |
| 去重 | DOI 主键 + 标题/首作者 Jaccard ≥ 0.90 兜底 + 合并偏好 | 只按标题 | 更稳健，降低误合并 |
| 打回补偿 | feedback 非空 → 提高 per-query、启用引用数下限、补用未用关键词组 | 同参数重跑 | 让打回真正改变策略 |
| 限流与 ToS | 每源 client 封装限流 + 退避 + 错误体回传；结果写文件 / 字段裁剪 | agent 自写请求 | 稳定性基线（science-skills 范式） |
| 规范片段骨架 | 新增 `apps/server/src/specs/`，`loadSpec(name)` 按需加载检索片段 | 继续塞提示词 | 可审查、可复用（M2-9 / M2-10 复用） |

## 实现步骤

1. `prompts.planner`：增加“锚定点”与“打回先锚点修订”；模型保持 flash 默认（`PI_MODEL_PLANNER` 覆盖入口已存在，不改默认）。
2. `keywords.ts`：`extractKeywordGroups` 默认 `maxGroups=10`；组内按 `/` 拆分为中英文两个查询（返回多查询）。
3. `search/config.ts`：新增 `SEARCH_COMPENSATE_PER_QUERY`(50)、`SEARCH_MIN_CITATIONS`(0)、`SEARCH_MAX_GROUPS`(10)。
4. `search/sources.ts`：源注册表（source → tier / domain / client 工厂），域→源映射与兜底链。
5. 新增 `ArxivClient`、`CrossrefClient`（fetch + 归一化 SearchPaper，含限流与 429 退避）。
6. `AcademicSearchService.search(planMd, opts?)`：按档位选源、并行、单源失败降级记录；查询反馈（收窄/放宽）与排名策略；`compensate` 时提高 per-query、按 minCitations 过滤、补用未用关键词组；`SearchStats` 增加 `keywordsUsed / queries / minCitations / failedSources`。
7. `merge.ts`：标题/首作者 Jaccard ≥ 0.90 兜底；合并偏好（DOI/卷期完整 > 出版源 > 引用数）在现有“最富字段”基础上补全。
8. `PiStepRunner` researcher 分支：feedback 非空 → `compensate=true`；检索概览写入所用关键词与参数。
9. `apps/server/src/specs/`：`loadSpec(name)` 读取 markdown 片段；新增 `source-tiers / query-construction / dedup` 三份片段，prompt 组装时加载。
10. 测试与文档（见清单）。

## 测试方案

- piConfig：planner 默认 flash、`PI_MODEL_PLANNER` 覆盖生效；
- keywords：≤10 组、中英文拆分；
- sources：注册表与 tier/domain 路由、单源失败降级；
- clients：arXiv / Crossref 归一化、限流、429 退避（mock fetch）；
- service：查询反馈（收窄/放宽）、compensate 参数生效、stats 字段；
- merge：Jaccard 兜底、合并偏好；
- runner：feedback 触发 compensate、stats 写入概览；
- 手动：`node scripts/verify-m2-7.mjs`（打回 planner 与 researcher，对比前后结果）；
- CI：typecheck + test 全绿。

## 文档更新清单

- `docs/architecture/02-system-architecture.md`：源分级路由、查询构造、去重、补偿、规范片段、planner v4-pro。
- `docs/guide/runbook.md`：新 `SEARCH_*` 环境变量与源分级说明、verify-m2-7。
- `docs/INDEX.md`：归档 M2-5 / M2-6，登记 M2-7 plan。

## 独立 review

> 子 agent 消息通道不可用（历史教训），由主 agent 以独立审查视角执行，结论记录如下。

- 日期：2026-08-16
- 审查视角：打回是否真改变策略、源分级是否可降级可记录、去重是否更稳健、成本是否可控
- 发现与处理：
  - [major] 打回必须改变策略，否则补偿是空话 → compensate 参数化并写入 stats，单测覆盖；
  - [major] 源分级必须按域选源、单源失败独立记录 → sources 注册表 + failedSources；
  - [minor] Pro 尚在测试，先保持 flash 默认 → 角色级模型覆盖入口已具备，后续切换零代码；
  - [minor] 规范片段先做最小骨架（loadSpec + 三个片段），M2-9 / M2-10 复用；
  - [minor] Jaccard 阈值 0.90 与合并偏好需单测固化。

## 不涉及 UI

纯后端，不涉及 UI，按 artifacts 硬性要求无需线框图或 HTML 预览。

## 实现 review

- 日期：2026-08-16
- 审查方式：类型检查 + 单测
- 结果：typecheck 全绿；server 67 个测试 + data 4 个测试通过
- 与 plan 的偏差与发现：
  - [major] 打回补偿通过 `feedback` 触发，`compensate` 参数化并写入 stats → 已实现并单测；
  - [major] 源分级以注册表 + 域选择实现，S2 无 key 标 T2、有 key 标 T1 → 已实现并单测；
  - [minor] 放宽查询在单源返回 0 时自动重试一次（取前两个词）→ 已实现；
  - [minor] Planner 保持 flash 默认，未改模型 → 与用户确认一致；
  - [minor] 规范片段先落为代码内 markdown + loadSpec，注入 researcher 系统提示词 → 已实现。
