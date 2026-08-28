---
title: 检索源免费 key 三连（plan）
status: active
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-source-keys.md"
areas: [server, docs]
---

# 检索源免费 key 三连（plan）

## 任务摘要
注册 OpenAlex / Semantic Scholar / IEEE 免费 key → `.env.local` → provider 注入 → runbook 文档。

## 为什么做
OpenAlex 2026-02 起强制 key（断供风险）；S2 无 key 限流 100/5min（真实发生过）；答辩讲"6 源对接、可插拔"。

## 预计效果
演示日检索稳定性上保险；答辩材料多一条"工程完整度"论据。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 范围 | 只配 key 不接 IEEE provider | 真接入 | 用户已确认；时间保流式 |
| 注入 | env 读取：OPENALEX_API_KEY（query `api_key`）/ S2_API_KEY（header `x-api-key`）/ IEEE_API_KEY（header） | 配置文件 | 与 OPENCODE_GO_API_KEY 管理一致 |
| 缺 key | 启动 warn 一次，行为同现状 | 硬失败 | 本地无 key 仍可演示 |

## 实现步骤
1. 注册 OpenAlex key（即时生效）；S2 key 走表单（可能等审批，先登记）；
2. `search/openalex.ts`：`OPENALEX_API_KEY` env 读取 + 注入 4 个 builder；缺失 warn（warn-once）；
3. `.env.local` 追加 `OPENALEX_API_KEY` 与 `SEMANTIC_SCHOLAR_API_KEY`（确认 .gitignore 已覆盖）；
4. `docs/guide/runbook.md` 补"检索源 key 申请"小节（OpenAlex/S2 的 URL/步骤/限额表；IEEE 一句话注明"仅备 key、无 provider，未来工作"）；
5. 真跑一轮检索确认携带与命中/失败计数（sourceHealth + verify 脚本前后对比）。

## Review 发现与修正
- [major] **S2 key 注入链路已完整存在**：`SEMANTIC_SCHOLAR_API_KEY` 已被 config 读取并注入 `x-api-key`、提级 T1、启用重试——plan 提议的 `S2_API_KEY` 是重复轮子 → 修正：S2 缩为"注册 key 填入现有变量 + runbook"，零代码。
- [minor] IEEE_API_KEY 指向不存在的 provider，"6 源"表述误导 → 修正：砍掉 IEEE，范围缩为 OpenAlex 注入 + S2 注册 + runbook；"未来工作"只在 runbook 一句话提及。
- [minor] "成功率 ≥ 现状"不可测 → 修正：以 sourceHealth 统计与 verify 脚本命中/失败计数前后对比为准。
- [✓] OpenAlex 注入点干净（4 个 builder 的 api_key query 参数）；.gitignore 已覆盖 .env.*；runbook 存在。

## 测试与验证
- 请求构造单测（有/无 key 的 URL/header 快照）；
- 真跑一轮对比命中数与失败率；
- `git grep` 确认 key 值不入库。

## 验收标准
- [ ] 三 key 生效；无 key 不崩；
- [ ] 检索成功率 ≥ 现状；
- [ ] runbook 完整；key 零泄露。
