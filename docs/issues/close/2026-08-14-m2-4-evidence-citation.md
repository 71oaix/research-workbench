---
title: M2-4 Writer / Reviewer 证据引用（基于检索卡片写稿与核查）
status: archived
created: 2026-08-14
updated: 2026-08-14
kind: feature
priority: high
triage: actionable
areas: [server, shared]
depends_on:
  - "docs/issues/close/2026-08-14-m2-3-academic-search.md"
resolution_plan: "docs/plans/open/2026-08-14-m2-4-evidence-citation.md"
---

# M2-4 Writer / Reviewer 证据引用

## 背景

M2-3 后 Researcher 已能产出确定性证据卡片 `research-cards.md`，但 Writer / Reviewer 仍是 M2-2 的占位提示词：writer 只输出 150 字骨架，reviewer 不真正核查引用。M2-4 让这两个角色进入真实环节：writer 基于证据卡片撰写带 [编号] 引用的综述初稿，reviewer 对照卡片与自动引用检查报告核查。

## 目标

- Writer 输出 `03-draft.md`：结构化综述初稿（引言 + 章节 + 小结），论点标注卡片 [编号]，文末给出参考文献列表（编号 → 标题 / 年份 / DOI / 链接）
- 确定性引用检查：代码提取草稿中的 [n]，校验是否都在卡片编号集合内，产出 `citation-lint.md`
- Reviewer 基于草稿 + 卡片 + 引用检查报告输出 `04-review.md`：可信引用清单、存疑引用与原因、覆盖不足方向、总体结论
- 全流程：Planner 审批 → Researcher 真实检索 → Writer 引用写作 → Reviewer 核查 → 用户审批 → completed

## 范围（做）

- `apps/server/src/citations/`：引用编号提取与检查（`extractCitationIds` / `buildCitationLint`）
- `apps/server/src/search/cards.ts` 增加卡片编号提取（`extractCardIds`）
- Writer / Reviewer 角色提示词更新
- `PiStepRunner` 增加 writer / reviewer 前置准备分支，注入卡片 / 草稿 / lint 报告；reviewer 前自动生成 `citation-lint.md` artifact
- `index.ts` 装配证据步骤服务
- 测试：引用提取与 lint、writer / reviewer 分支
- `scripts/verify-m2-4.mjs`：端到端验证草稿引用与审查意见

## 不做（明确排除）

- 自动判定综述“通过 / 不通过”（由人审批）
- 内容级事实核查（逐句读全文验证论点是否真由论文支持），留待 M3 或后续
- 写作-修改迭代循环（Revisor agent），留待 M3
- 引用导出为 APA / GB/T 格式，留待 M3
- UI（M2-5）

## 验收标准

- [ ] `03-draft.md` 含不少于 3 个章节、不少于 5 个 [编号] 引用，且所有引用编号都存在于 `research-cards.md`
- [ ] `citation-lint.md` 自动生成：引用总数、有效编号集合、越界 / 缺失引用清单
- [ ] `04-review.md` 包含“可信引用清单 / 存疑引用与原因 / 覆盖不足的方向”三部分
- [ ] 全流程：Planner 审批 → Researcher 真实检索 → Writer → Reviewer → 审批 → completed
- [ ] typecheck / test 全绿，runbook 与 verify 脚本更新

## 关联

- 依赖：M2-3（已合并）
- 后续：M2-5 工作流 UI → M3 增强与申报
