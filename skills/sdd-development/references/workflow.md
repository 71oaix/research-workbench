---
title: 开发循环九步详解
source: sdd-development
type: reference
---

# 开发循环（九步）

```
① 提出/确认 issue → ② 编写 plan → ③ plan 独立 review → ④ 人确认 plan
→ ⑤ 实现 → ⑥ 实现独立 review → ⑦ 测试验证 → ⑧ 人确认合并 → ⑨ 归档
```

## 各步骤要点

| 步骤 | 做什么 | 产物/要求 |
|------|--------|----------|
| ① issue | 要做什么：背景、目标、范围（含明确**不做**）、验收标准 | `docs/issues/open/YYYY-MM-DD-简述.md`，frontmatter 填 kind/priority/triage/areas |
| ② plan | 怎么做：任务解释、关键决策、实现步骤、测试方案、需更新文档 | `docs/plans/open/YYYY-MM-DD-简述.md`（与 issue 同名），须满足 [artifacts.md](artifacts.md) 要求 |
| ③ plan review | 开独立 review（fresh context 的 subagent），查遗漏/矛盾/不可验证点 | review 意见合入 plan 后才算完成 |
| ④ 人确认 | 展示 plan 摘要（任务解释 + 关键决策），等待用户批准 | **未批准不得进入实现** |
| ⑤ 实现 | 按 plan 步骤写代码，完成一项更新一项 | 每步可追踪 |
| ⑥ 实现 review | 独立 review 检查与 plan 一致性、代码质量 | 问题修复后才算完成 |
| ⑦ 测试 | 单元测试 / 最小验证，按 areas 圈定范围 | 记录验证结果 |
| ⑧ 人确认合并 | 展示关键改动说明 + 预览地址 | 用户批准后提交/PR |
| ⑨ 归档 | issue+plan 移入 close/，status 改 archived | 同步 INDEX.md |

## 子流程约定

- **issue 与 plan 同名**：`YYYY-MM-DD-简述.md`，便于互相引用
- **GitHub 并行**：本地 SDD 文档全部进 git 仓库推送 GitHub；GitHub issue/PR 管协作与合并，SDD 文档管任务规格（见项目 AGENTS.md）
- **跳过规则**：用户明确豁免、或纯文档/一行改动等小任务时，可跳过 plan/review 步骤，但事后必须补文档记录
