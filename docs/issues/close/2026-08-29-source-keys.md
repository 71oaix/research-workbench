---
title: 检索源免费 key 三连（OpenAlex / Semantic Scholar / IEEE）
status: archived
created: 2026-08-29
updated: 2026-08-29
kind: infra
priority: medium
triage: planned
areas: [server, docs]
---

# 检索源免费 key 三连

## 背景
OpenAlex 2026-02-24 起强制 API key（免费注册，$1/天额度，keyless 不保证生产可用）——现网裸调有断供风险；Semantic Scholar 无 key 限流 100 次/5 分钟（本项目真实发生过）；IEEE Xplore 提供免费个人 key。用户已确认：不接入 IEEE 检索 provider，只备 key。

## 目标
三个免费 key 注册并注入 provider，消除限流/断供风险；runbook 补申请文档，答辩可讲"已对接 6 源、架构可插拔"。

## 范围（做）
- 注册 OpenAlex / Semantic Scholar / IEEE API key，写入 `.env.local`（不进库）；
- `OPENALEX_API_KEY` / `S2_API_KEY` / `IEEE_API_KEY` 环境变量读取，注入对应 provider 请求（query 参数或 header）；
- 缺失时启动 `console.warn` 一次（不硬失败）；
- `docs/guide/runbook.md` 补"检索源 key 申请"小节（链接、步骤、限额表）。

## 不做
- IEEE 检索 provider 接入；付费源购买；key 轮换管理。

## 验收标准
- [ ] 有 key 时请求携带（单测验证请求构造）；
- [ ] 无 key 不崩且有警告；
- [ ] 真跑一轮检索成功率不低于现状；
- [ ] runbook 完整；key 不出现在任何入库文件。
