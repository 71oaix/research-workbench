---
title: plans 目录规范（SDD 方案索引）
status: active
created: 2026-08-06
updated: 2026-08-06
---

# plans 目录规范

> 对应 issue 的**怎么做**：解决方案、思考决策、实现步骤拆分。
> 每个 plan 对应一个 issue，文件名与 issue 保持一致（`YYYY-MM-DD-简述.md`）。

## 目录结构

```text
docs/plans/
├── readme.md          ← 本文件
├── open/              ← 已编写、待审批或执行中的 plan
└── close/             ← 已执行完成的 plan
```

## plan frontmatter

```yaml
---
title: 对应任务标题（plan）
status: active          # active | archived
created: 2026-08-06
updated: 2026-08-06
issue: 2026-08-06-简述  # 关联 issue 文件名（不带 .md）
areas: [docs, workflow] # 影响范围（与 issue 一致，测试时按此圈定）
---
```

## 内容要求

- **任务解释**：一句话说清要解决什么
- **关键决策**：方案选择与权衡（为什么这么做，不做什么，为什么）
- **实现步骤**：可执行的拆分清单
- **测试方案**：如何验证（单元测试 / e2e / 手动验证）
- **文档更新**：本次改动需要同步哪些 docs 文档（自动更新文档机制）
- 简洁优先：不塞大段代码，方案级描述即可

## 质量要求

- 每个 plan 完成后由**独立 review** 检查完善性（另一视角检查遗漏、矛盾、不可验证点）
- review 意见合入 plan 后才能进入实现
- 实现完成后再次独立 review 检查实现与 plan 一致性
