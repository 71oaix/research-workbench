# 01 · 开发流程规范

> 目的：让所有开发可见、可追溯、可交接。这是本项目的实习加分项，也是作品质量的基本保障。

## 1. Issue 规范

- 一个 issue = 一个可验收的交付（功能、缺陷、文档、基础设施）
- 按 `.github/ISSUE_TEMPLATE/feature_request.md` 填写：背景（业务需求，脱敏）→ 需求描述 → 验收标准 → 涉及模块
- 标签：`enhancement` / `bug` / `docs` / `infra` / `question`
- 里程碑：M1 骨架（8/12） / M2 闭环（8/20） / M3 材料（9/1）

## 2. 分支与 PR

```text
main
 └─ feat/12-search-papers      ← 每个 issue 一个分支
     └─ PR → squash merge → 关闭 issue
```

- 分支命名：`feat/<issue号>-<简述>`、`fix/<issue号>-<简述>`
- PR 模板必填：背景 / 改动 / 测试 / 演示
- 合入方式：squash merge，保持 main 历史干净
- PR 描述里关联 issue：`Closes #12`

## 3. Commit 规范

```text
feat: 接入 Semantic Scholar 检索工具
fix: 修复计划审批后状态不更新的问题
docs: 补充开发流程说明
chore: 升级依赖
```

## 4. Definition of Done

- [ ] 代码可运行，端到端验证过
- [ ] 自动化测试（如有）通过
- [ ] README / 相关文档已同步
- [ ] PR 描述包含演示截图或说明

## 5. AI 协作约定

- AI 是主力写码工具，但每个 PR 必须人工审阅后才合入
- 重大设计决策（架构、数据模型、范围变更）先写 issue 讨论，再进代码
- 所有外部 API 接入记录限流、费用、失败处理到 issue 备注
