---
title: M2-7 检索迭代、全文证据与写作质量闭环（基于真实运行自评）
status: active
created: 2026-08-15
updated: 2026-08-15
kind: feature
priority: high
triage: actionable
areas: [server, data, shared, web]
depends_on:
  - "docs/issues/open/2026-08-15-m2-6-workflow-iteration.md"
resolution_plan: "docs/plans/open/2026-08-15-m2-7-search-iteration-evidence-loop.md"
---

# M2-7 检索迭代、全文证据与写作质量闭环

## 背景：一次真实运行的自评

2026-08-15 用研镜完整跑了一次真实任务「研究下多智能体的记忆架构」，并走了一次「打回修改」：

- 计划（01-plan.md v1）：结构完整，给出 7 组检索关键词与大纲；
- 检索 v1：63 条命中、58 篇去重，Semantic Scholar 一组失败；
- 用户打回：「感觉你找的论文太少了，而且引用数也很低，参考价值不够」；
- 检索 v2：13 条命中、8 篇去重，Semantic Scholar 三组全部失败，OpenAlex 返回大量无关论文，模型如实报告“补偿检索失败”；
- 写作：模型自发改用 `[V1-x]` / `[V2-x]` 前缀编号，把 v1 与 v2 的论文混编进综述，且**没有阅读论文全文，仅凭标题与摘要写作**；
- 审查：自动引用检查按纯数字 `[n]` 匹配，报告“引用次数 0”，自动审查失效；Reviewer 人工识别出引用格式、证据版本、覆盖度、借位引用四个阻断级问题，结论“不通过”。

## 用户补充问题（已并入本 issue）

1. 写作草稿整体质量差；
2. 检索到的文献没有“真正下载并阅读”，写作只基于标题与摘要；
3. “每步骤新对话 + 文档交接”需要确认是否实现，并要有合适的观测与评估手段；
4. 第一步拆解任务不够深：规划可改用 deepseek-v4-pro，用几轮对话精确拆解问题的锚定点；
5. 论文源太少，需要系统性提高论文数量与质量。

## 自评与确认结论

- “每步骤新对话 + 文档交接”**已实现**：每个角色创建独立 pi 会话，产物以版本化 artifact 交接，修改意见随 `pending_feedback` 注入下一次对话；本次运行在隔离会话目录留下 researcher v1 / v2、writer、reviewer 四个独立会话。
- “下载并阅读全文再写作”**未实现**：当前 writer 只有证据卡片（标题 / 摘要截断 300 字），这是写作质量差的关键原因之一。
- 观测与评估手段**不完整**：有 artifacts / 事件 / usage 记录，但缺少输出质量指标（证据相关度、引用有效性、大纲覆盖度、来源失败统计）的自动评估报告。

## 目标

- 规划：用 deepseek-v4-pro 深度拆解，产出“锚定点”（核心概念 / 方法 / 场景 / 时间范围），打回时先修订锚点再重查
- 检索：用足全部关键词组、组内中英文拆分多查询、新增 arXiv 与 Crossref 源、Semantic Scholar 失败可见并可缓解；打回时启用确定性补偿（提高条数、引用数下限过滤、补用未用关键词组）
- 证据：多版本卡片合并为“证据池”（去重 + 标注来源版本），writer / reviewer / lint 统一基于证据池
- 全文：对 top-N 论文下载 PDF、提取文本，writer 基于全文写作（付费墙回退到摘要并标注）
- 引用：prompt 强制纯数字 `[n]`，lint 兼容 `[V1-n]` 前缀并提示格式异常
- 评估：自动生成 `evaluation-report.md`（锚点覆盖、证据相关度、引用有效性、大纲覆盖度、来源失败），UI 展示关键指标
- 流程：Reviewer 不通过时前端一键“打回 Writer 并附带审查意见”

## 范围（做）

### A. 规划深度

- Planner 默认模型改为 `deepseek-v4-pro`（`PI_MODEL_PLANNER` 可覆盖），提示词要求先澄清问题边界，再输出“锚定点”与检索计划
- 打回规划时，提示词要求先输出“锚点修订”小节，再生成新计划（复用 M2-6 修改循环，形成 2-3 轮细化）

### B. 检索数量与质量

- 关键词用足：提取上限从 3 组提升到最多 10 组；组内按 `/` 拆分中英文生成多个查询
- 新增数据源：arXiv API、Crossref API；`AcademicSearchClient` 数组扩展
- 打回补偿：feedback 非空时提升 `per-query`、启用引用数下限过滤、补用未使用过的关键词组
- 相关性把关：标题 / 摘要与锚点词的重叠度作为排序信号，弱相关论文垫底并标注，不直接硬删
- Semantic Scholar：失败统计保留并提示配置 key；中文关键词自动补英文等价查询

### C. 全文获取与阅读

- 新增全文模块：对 top-N（默认 8）论文解析 PDF 地址（arXiv / S2 openAccessPdf / OpenAlex best_oa_location），下载并提取文本，存入 `papers.full_text`
- Writer 注入 top-N 全文（截断），要求基于全文要点写作，引用必须落在证据池
- 付费墙回退：无法获取全文的论文标注“仅摘要”，writer 不得据此展开论点

### D. 证据池与引用

- 多版本 research-cards 合并去重为当前证据池（标注来源版本），writer / reviewer / lint 统一基于合并池
- Writer 提示词强制纯数字 `[n]`；lint 兼容 `[V1-n]` / `[V2-n]` 映射并给出“格式异常”提示；参考文献列表与正文引用一致性校验

### E. 观测与评估

- 新增 `evaluation-report.md`：锚点覆盖、证据相关度统计、引用有效性（lint 结果）、大纲覆盖度（草稿章节 vs 大纲）、来源与失败统计
- UI 右侧证据面板展示关键指标；Reviewer 步骤增加“打回 Writer 并附带审查意见”一键操作

## 不做

- 引用雪球 / 模型精排 / 向量检索（仍留 M3）
- 独立 Reader 角色与精读笔记（先用“全文注入 writer”，M3 再做角色拆分）
- 对话式记忆管理、UI 视觉打磨

## 验收标准

- [ ] Planner 默认 v4-pro，输出含“锚定点”，打回后生成“锚点修订”再重查
- [ ] 打回 researcher 后使用全部关键词组 + 补偿参数，结果数量与相关度不劣于上一版
- [ ] 数据源含 Semantic Scholar / OpenAlex / arXiv / Crossref；单源失败降级并记录
- [ ] top-N 论文下载并提取全文；writer 引用全部落在证据池，lint 引用数 > 0
- [ ] lint 兼容 `[V1-n]` 并提示格式异常；参考文献与正文引用一致
- [ ] `evaluation-report.md` 自动生成并在 UI 展示关键指标
- [ ] Reviewer 不通过时前端一键“打回 Writer 并带审查意见”
- [ ] typecheck / test 全绿，verify 脚本更新

## 关联

- 依赖：M2-6（同分支待合并）
- 后续：M3 增强（引用雪球、模型精排、Reader 角色、评估）与申报
