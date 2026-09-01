---
type: gotchas
related-skill: project-doc-architecture
last-updated: 2026-07-31
---

# Gotchas

> 使用本 skill 时常见的错误和踩坑记录。

### G001：SKILL.md 描述混淆了 doc-contract 和 project-doc-architecture

- **默认假设：** 只要涉及文档就加载本 skill。
- **实际规则：** 个体文档的格式和状态流转应由 doc-contract 管理。本 skill 只负责整体架构。
- **正确做法：** 区分场景：创建目录/重构结构/INDEX 格式 → 本 skill；创建/修改单个文档 → doc-contract。

### G002：创建文档后忘记同步 INDEX.md

- **默认假设：** 创建好文档就完成了。
- **实际规则：** 本 skill 的自动化规则 2 要求每次操作后检查 INDEX.md 同步。
- **正确做法：** 把"检查 INDEX.md"作为文档操作的固定收尾步骤。

### G003：多版本不靠目录管理（git 负责版本）

- **默认假设：** 不同版本的设计文档需要 v1/、v2/ 目录分层。
- **实际规则：** 重建后已移除多版本目录——版本由 git 管理，docs/ 只按主题分类。
- **正确做法：** 不创建 vN/ 版本目录；当前版本内容按主题放入对应分类目录，历史版本交给 git。

---

## 自迭代规则

每次使用后若发现新的坑点，请询问用户是否追加。新增按编号 G004... 继续。
