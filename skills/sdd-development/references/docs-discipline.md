---
title: 文档纪律（五层映射与维护规则）
source: sdd-development
type: reference
---

# 文档纪律

## 先文档后代码

- 没有 plan 就不写实现（除非用户明确豁免）
- 规格在 docs 里，不在对话里——压缩/清空对话历史不丢失任务规格，随时可从文档恢复

## 五层文档与项目分类

博客五层（产品/开发/设计/测试/运维）映射到项目六分类目录（architecture/specification/guide/research/reference/decisions），**不新建五层同名目录**。完整映射见 `docs/guide/02-document-taxonomy.md`。

- 产品 → `specification/` + `decisions/`
- 开发 → `architecture/`
- 设计 → `guide/`（设计规范）
- 测试 → `reference/`（bug case）+ `guide/`（测试流程）
- 运维 → `guide/`（runbook）

## 维护规则

- 遵循 doc-contract：frontmatter 必填 `title/status/created/updated`，状态只有 `active | archived`
- 创建、修改、移动、归档文档后，必须同步更新 `docs/INDEX.md`
- 文档互相链接（issue↔plan↔架构文档），模型更新时不易遗漏
- 归档不删除：close/ 保留完整记录
- **每个 plan 的步骤清单里必须含"更新相关文档"**——文档即交付物
