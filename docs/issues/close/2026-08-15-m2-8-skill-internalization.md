---
title: M2-8 科研 Skill 流程内化（借鉴 nature-skills 与 science-skills）
status: archived
supersedes:
  - "docs/issues/open/2026-08-15-m2-7-search-iteration-evidence-loop.md"
  - "docs/issues/open/2026-08-16-m2-8-fulltext-evidence.md"
  - "docs/issues/open/2026-08-16-m2-9-citation-verification.md"
  - "docs/issues/open/2026-08-16-m2-10-review-evaluation.md"
created: 2026-08-15
updated: 2026-08-15
kind: feature
priority: high
triage: actionable
areas: [server, data, shared, web]
depends_on:
  - "docs/issues/open/2026-08-15-m2-7-search-iteration-evidence-loop.md"
resolution_plan: "docs/plans/open/2026-08-15-m2-8-skill-internalization.md"
---

# M2-8 科研 Skill 流程内化

## 背景

已通读两个高价值科研 skill 仓库：

- [nature-skills](https://github.com/Yuan1z0825/nature-skills)：19 个 skill，覆盖学术检索、引用核验、全文下载、精读卡片、引用管理、写作、审查、文献流水线等，核心是“静态流程片段 + 动态路由 + 确定性脚本”的规范体系；
- [science-skills](https://github.com/google-deepmind/science-skills)：38 个 skill，覆盖 30+ 生物/化学数据库与文献检索，核心是“SKILL.md 规范 + 封装 CLI 脚本 + 限流与 ToS + 凭据协议”。

两者本质都是**流程规范**。研镜目前只有“角色提示词 + 少量代码管道”，缺少这一层：可加载的流程片段、源分级路由、去重/引用核验/审查/写作的确定性规范。本 issue 把两套方法论内化到研镜，作为 M2-7 实现时的架构基准（M2-7 的 plan 保持不动，M2-8 与之合并实施或分期执行）。

## 内化清单

### A. 分层路由架构（nature-skills 的核心）

- 把“角色 prompt”升级为“流程规范包”：每个工作流一个 manifest，声明 `always_load` 与按需片段（检索策略 / 去重 / 引用核验 / 卡片 schema / 审查 axes / 写作契约）
- 规则“从磁盘加载，不凭记忆执行”：研镜在 docs 或代码内维护这些片段，运行时按当前任务加载，避免模型自由发挥

### B. 检索规范

- **源分级路由**：T1（PubMed/Crossref/arXiv）→ T2（Semantic Scholar/bioRxiv/medRxiv）→ T3（Scopus/WoS/Google Scholar，需警告）；域→源映射 + 兜底链；单源失败独立报告并继续
- **查询构造**：概念 → 同义词 → 布尔查询；结果量反馈规则（>500 收窄、<10 放宽）；排名策略（relevance / date / citation / 组合评分）
- **去重引擎**：DOI 主键 + 标题+首作者 Jaccard ≥ 0.90 兜底；合并偏好（完整元数据 > 出版源 > 引用数）
- **限流与 ToS**：arXiv 1 req/3s、S2 1/s（key 100/s）、Crossref 50/s、OpenAlex polite pool 与成本表；统一封装脚本限流，禁止模型自写请求；429 退避 + 错误响应体回传；凭据只走环境变量
- **输出纪律**：结果写文件、`--select` 字段裁剪、避免 context 溢出

### C. 引用核验（升级现有 lint）

- 解析 DOI / PMID / arXiv / 标题+作者
- 多源交叉逐字段比对（Crossref → PubMed → S2 → Web/CNKI）：作者顺序、年份、卷期、页码、标题核心词
- 分级与置信度：Critical / Warning / Info；Verified / Check suggested / Needs fix / Unverifiable；结构化报告 + BibTeX 补丁
- 批量 >20 条时分 10-15 条/组并行核验

### D. 全文获取与阅读（“真正下载并读”）

- 合法 OA 优先（PMC / Unpaywall / arXiv / publisher OA）；Elsevier / Springer Nature / IEEE 可先走 publisher API；机构访问仅在用户授权会话内
- PDF 真实性校验（非空、`%PDF`、文本可读），状态清单（downloaded / oa_not_found / no_authorized_pdf_found 等），下载清单审计留痕
- 阅读保留 source map（页 / 块锚点），写作引用必须落到证据池

### E. 精读卡片（Paper Card schema）

- 固定 16 节：基本信息、一句话摘要、研究问题、背景路径、痛点、核心思想、方法、模块拆解、关键公式、实验证据链、结论边界、作者限制、批判分析、知识收获、知识连接、研究想法
- 证据标签：`[Paper]` / `[External]` / `[Analysis]` / `[Hypothesis]` / `[User]`
- 定位模式：page-grounded / structure-grounded / source-limited；claim 强度动词规则；矛盾显式记录
- 研究想法六道门：可追溯、可证伪假设、增量、验证方案、失败原因、措辞（不得自称 novel）

### F. 审查规范（升级 reviewer）

- 不可变审查包 + 审查者相互隔离（分上下文）+ 预分配 emphasis
- concern ledger 字段：issue_key / severity / blocking / claim_pointer / evidence_pointer / resolution_test
- 无证据不推断（`Not assessable from provided material`）；会后才做综合

### G. 写作规范（升级 writer）

- 写前对齐门：一句话论点 + 术语表 + 段落图，先给人确认再写
- 从证据向外写；动词与证据强度匹配；删除 unsupported novelty 词
- 输出附带 claim-evidence map（Claim | Evidence | Status）与“定向修改”提示

### H. 评估与评分

- 文献六维评分：Topic Match（35，门禁） / Method（20） / Journal（15） / Network（10） / Applied（10） / Archival（10），运行后校准
- Gap 分析报告含检索方法与命中数记录（可复现）

### I. 工程规范（science-skills）

- 每个数据源一个封装 CLI：子命令、`--output` 必填、退出码、限流、错误体回传
- SKILL.md 结构模板：Overview / Dependencies / Quick Start / Utility Scripts / Workflow / Rate Limiting / Common Mistakes
- 凭据安全协议：`.env`、不粘贴到对话、屏蔽显示；许可提示文件记录 ToS

## 范围（做）

- 建立“流程规范包”目录结构（manifest + fragments），检索 / 去重 / 引用核验 / 卡片 / 审查 / 写作各一个规范片段
- 检索：T1/T2/T3 路由、查询构造规则、去重引擎升级（Jaccard 兜底）、新源（arXiv / Crossref / Europe PMC OA）、限流与错误体、输出到文件
- 引用核验：字段级多源比对 + 分级报告（替代当前纯数字 lint）
- 全文：OA 优先下载 + PDF 校验 + source map 阅读注入 writer
- 精读卡片：16 节 schema + 证据标签（M3 可做独立 Reader 角色，本阶段先定义 schema 与审计脚本）
- 审查：concern ledger 结构化输出（severity / blocking / claim / evidence / resolution）
- 写作：对齐门 + claim-evidence map + 术语表
- 评估：六维评分接入 evaluation-report；凭据与限流规范固化到代码

## 不做

- 不引入 PubMed/CNKI 等需要机构授权的源（研镜 MVP 面向 OA/API 源；机构通道留后续）
- 不实现多审查者隔离执行（先做单一 reviewer 的 concern ledger 化）
- 不引入 Zotero / EndNote 集成（导出格式留 M3）
- UI 视觉打磨

## 验收标准

- [ ] 检索按 T1/T2/T3 路由并记录每源失败；查询构造与去重规则文档化且被代码执行
- [ ] 引用核验产出字段级分级报告（≥ Critical/Warning/Info 与 4 级置信度）
- [ ] top-N 论文 OA 优先下载、PDF 校验、全文进 writer 上下文，引用全部落在证据池
- [ ] 精读卡片按 16 节 schema + 证据标签生成，审计脚本通过
- [ ] reviewer 输出含 concern ledger（severity / blocking / claim / evidence / resolution）
- [ ] writer 输出前对齐门生效（一句话论点 + 段落图确认），草稿附 claim-evidence map
- [ ] evaluation-report 含六维评分与主题匹配门禁
- [ ] 每源 client 限流 + 错误体回传 + 输出写文件；凭据仅环境变量
- [ ] typecheck / test 全绿，verify 脚本更新

## 关联

- 依赖：M2-6、M2-7（同分支待合并；M2-8 与 M2-7 合并实施或分期执行，由 plan 决定）
- 后续：M3（独立 Reader 角色、多审查者、引用雪球、导出格式）
