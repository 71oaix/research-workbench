---
title: M2-12 可靠性与性能加固（下载完整性、检索并发、Writer 思考与上下文、核验稳健）
status: active
created: 2026-08-17
updated: 2026-08-17
kind: feature
priority: high
triage: actionable
areas: [server, web]
depends_on:
  - "docs/issues/open/2026-08-16-m2-11-runtime-review-fixes.md"
---

# M2-12 可靠性与性能加固

## 背景

M2-11 对抗审查 + 两次真实运行（全 approve / 带打回）暴露：下载成功率与速度、检索并发、Writer 思考强度与上下文、引用核验稳健性四块仍有实质问题。本文按用户关注点逐项调查分析，给出修复范围。

## 问题清单（含调查与分析）

### A. 全文下载：速度慢 + 完整性不足（用户最高优先级）

调查（代码 + 真实数据）：
- `resolvePdfUrl` 只返回**第一个命中候选**（arxiv → url.pdf → S2 openAccessPdf → OpenAlex best_oa_location），下载失败直接返回 null，**不回退到下一个候选**；真实案例中 15 篇仅 8 篇有全文，部分失败可能本可回退成功。
- 下载串行（topN 逐篇，每篇最多 60s 超时），researcher 阶段约 2 分钟。
- 无“下载状态清单”：哪篇成功、失败原因（无 OA / 超时 / 非 PDF / 提取失败）没有落库或展示，用户只能看到“仅摘要”，无法判断是本来就没有还是下载失败。
- 完整性：buffer 完整后才写文件，不会留半文件；但“%PDF 头通过、内容截断/损坏”没有页数与文本阈值校验。

修复方向：
1. 候选 URL 列表（含 arxiv、url、S2 OA、OpenAlex OA）依次尝试，全部失败才标失败；
2. 并发下载（每篇独立 Promise，限 2-3 并发）；
3. 落库“下载状态 + 失败原因”，卡片/全文面板展示；
4. 校验增强：提取文本长度阈值（如 ≥500 字符才算有效全文）。

### B. 检索并发失控

调查：`AcademicSearchService.search` 用 `Promise.allSettled` 把 36 查询 × 2-4 源全部并发，但每个源内部 `RateLimiter` 把请求串行化（arxiv 3s/次 → 单源 36 查询 ≈ 108s），真实 researcher 约 2 分钟；失败源记录 20 个（S2 T2 与 arxiv 大量 429/失败）。

修复方向：每源并发池（同时 ≤3，仍走限流器）；默认查询组 10 → 6-8；失败快速降级不重试所有源。预期检索 2 分钟 → 40-60s。

### C. Writer：思考强度未开 + 上下文膨胀（用户点名关心）

调查：
- pi 会话记录显示 `thinking_level_change → thinkingLevel: "off"`；PiRuntimeProvider 调 `createAgentSessionFromServices` 时**未传 `thinkingLevel`**，默认不启用 pi 层思考；模型自身会输出 `reasoning_content`（deepseek 内置），但 pi 层未控制强度。pi SDK 支持 `off / minimal / low / medium / high`，`model.reasoning: true` 已配置（支持思考），在 `createAgentSessionFromServices` 传 `thinkingLevel: 'high'` 即可开最高强度。
- 上下文膨胀：writer prompt 把全部 `paper-fulltext.md`（8 篇 × 2 万字符 ≈ 16 万字符）+ 打回时的 v1 全量拼入，真实 writer 单步 3-4 分钟、token 大、有上下文溢出风险。

修复方向：
1. 思考强度：`thinkingLevel` 按角色可配（默认 `high`），`PI_THINKING_LEVEL` / `PI_THINKING_<ROLE>` 环境变量；
2. 上下文裁剪：全文按“每篇摘录 3-5k 字符（标题、摘要、引言、结论）”注入，或只注入 top-3 全文；打回时注入 v1 结构摘要而非全文。

### D. 引用核验：稳健性不足

调查：真实案例 15 篇中 7 篇 Unverifiable，全部因 arXiv 429（`arxiv.ts` 重试 2 次、退避 1s/2s 不够）；核验串行（15 篇 × 3s 限流 ≈ 45-60s）；无跨工作流缓存（同论文重复核验）；Crossref 对 arXiv DOI 不权威（M2-11 已修，但覆盖率依赖 arXiv 可用性）。

修复方向：
1. arXiv 查询更保守（6s/次 + 更多重试 + 429 专项退避）；
2. 核验结果落库缓存（DOI/arXiv 为键，跨工作流复用）；
3. 核验并发（每源限流内并发 2-3）；
4. 多源回退：Crossref → arXiv → Semantic Scholar（无 key 时跳过），全部失败才 Unverifiable。

### E. 可靠性 P1（对抗审查发现）

1. WS 重连不拉数据：重连只发 hello，store 不重新拉详情，断线期间事件丢失、UI 陈旧（step_not_found 的温床）。
2. 并发审批无防重入：`decide` 检查-执行非原子，双击可能双写（数据未触发，理论风险）。

### F. 可靠性 P2

1. 评估相关度（0.06）与大纲覆盖（1/7）失真：草稿标题改写导致字面匹配失败，需模糊匹配。
2. 打回状态更新非事务：异常可能残留 pending。
3. 审批意见无长度上限，可注入超大 prompt。

## 范围（做）

- A 全文：多候选回退 + 并发 + 状态落库 + 校验阈值。
- B 检索：每源并发池 + 查询组上限调优。
- C Writer：思考强度 high（按角色可配）+ 全文摘录注入 + 打回结构摘要。
- D 核验：429 退避 + 缓存 + 并发 + 多源回退。
- E：WS 重连刷新 + 审批乐观锁。
- F1：大纲/相关度模糊匹配。

## 不做

- 六维完整评分、多审查者隔离（留 M3）。
- 缓存持久化到独立表（先用 papers 表附加字段或内存缓存）。

## 验收标准

- [ ] 真实流程全文成功率提升且每篇有“成功/失败原因”状态；下载阶段耗时下降
- [ ] 检索阶段耗时显著下降（目标 ≤60s），失败源减少
- [ ] Writer 会话 thinkingLevel 为 high，单步耗时与 token 下降（上下文裁剪后）
- [ ] 引用核验 Unverifiable 占比下降，arXiv 429 不再成批出现
- [ ] WS 重连后自动刷新；重复审批返回 409 而非双写
- [ ] 评估大纲覆盖与相关度有区分度
- [ ] typecheck / test 全绿
