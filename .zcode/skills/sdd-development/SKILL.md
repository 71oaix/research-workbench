---
name: sdd-development
description: >
  指导 Agent 按轻量 SDD（Spec-Driven Development）流程开发功能。
  触发场景：开始新功能/修复/重构/迁移任务，用户要求"写 issue"、"做 plan"、
  "开始开发"、"implement"、"按流程走"等涉及代码交付的请求；
  项目存在 docs/issues + docs/plans 结构时必用。
  不触发：纯问答、纯调研、单文件小改动（可直接做，事后补文档）。
---

# SDD 开发流程

> 仿 [Harness Engineering 实践](https://blog.xlab.app/p/c3ac2cfd/)（ttttmr）。
> 核心信念：**文档是 Agent 的上下文底座**——一切需要被知道的知识都应文档化，人只做决策。

## 文件地图

| 文件 | 何时读 |
|------|--------|
| [references/workflow.md](references/workflow.md) | 开始任何开发任务时（九步循环 + 各步骤要求） |
| [references/artifacts.md](references/artifacts.md) | 编写 plan / 汇报合并时（人决策所需信息，硬性要求） |
| [references/docs-discipline.md](references/docs-discipline.md) | 涉及创建/更新文档时（五层映射、doc-contract、INDEX） |
| [gotchas.md](gotchas.md) | 遇到问题、收尾检查、或准备跳过流程步骤时 |

## 工作流程

```
① 提出/确认 issue → ② 编写 plan → ③ plan 独立 review → ④ 人确认 plan
→ ⑤ 实现 → ⑥ 实现独立 review → ⑦ 测试验证 → ⑧ 人确认合并 → ⑨ 归档
```

- 未确认 plan 不得进入实现（用户明确豁免的小改动除外）
- 每完成一个阶段，向用户汇报当前状态与下一步

## 关键原则

1. **先文档后代码**：没有 plan 就不写实现
2. **规格在 docs 里，不在对话里**：不依赖对话记忆，随时可从文档恢复任务
3. **人确认两件事**：确认 Plan、确认合并；为此产物必须满足 artifacts 硬性要求
4. **文档即交付物**：改完代码同步更新文档，INDEX.md 同步
