---
title: 思考过程展示（plan）
status: active
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-thinking-display.md"
areas: [server, web]
depends_on:
  - "docs/plans/open/2026-08-29-streaming.md"
---

# 思考过程展示（plan）

## 任务摘要
探针验证 DeepSeek v4-flash 是否产出 thinking 块；有 → thinking 增量经 step.stream 展示为 Claude 式折叠块；无 → 归档记录，shimmer（Plan 1）为最终态。

## 为什么做
thinkingLevel 已配置但思考不可见；是否可行取决于模型输出，必须验证先行避免白做。

## 预计效果
有块：气泡内浅色斜体思考块实时滚动，结束折叠为"已思考 N 秒"——最被认知的 agent 视觉语言。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 验证先行 | 探针脚本 dump content 块类型 | 直接实现 | 模型不支持则全部白做 |
| 通道 | 复用 step.stream kind:'thinking' | 新事件 | 协议一次到位（Plan 2 已预留） |
| 展示 | 进行中：浅底斜体块（max-height 滚动+自动滚底）；结束：折叠为"已思考 N 秒" | 常驻全文 | 对齐 Claude，省纵向空间 |
| 计时 | 前端 message_start→首个 text delta 间隔 | 后端上报 | 免改协议 |

## 实现步骤
1. 探针脚本 `scripts/probe-thinking.mts`：跑 planner 一步，遍历 `message_update` partial message content，打印块类型与 thinking 样本（前 200 字）；
2. 分支 A（有块）：`send()` 差分 thinking 增量 → `onStream(...,'thinking',d)`；store 双缓冲（text/thinking 分开）；ChatFlow 思考块组件（滚动/折叠/计时三态）；
3. 分支 B（无块）：本 issue 归档 + 原因入档；无协议回滚（kind 留着无害）。

## Review 发现与修正
- [minor] "message_start→首个 text delta"计时不可实现——message_start 不经 WS 下发 → 修正：计时 = 首个 thinking 帧 → 首个 text 帧（前端可观测）。
- [minor] 分支 B 归档须按 doc-contract 翻转 frontmatter + 同步 INDEX → 已补步骤。
- [✓] 前提成立：thinkingLevel 默认 xhigh、模型 reasoning:true、ThinkingContent 块类型存在；探针先行正确（openai-completions 路径可能把 thinking 转成 text，必须实测）。
- [cross] P1 的 shimmer 骨架被流式预览取代而砍掉 → 本 plan"无块降级"的最终态改为现状 spinner+轮换文案（非 shimmer）。

## 测试与验证
- 探针输出存档 `docs/research/2026-08-29-thinking-probe.md`（或截图）；
- 思考块组件三态单测；真跑一轮端到端确认。

## 验收标准
- [ ] 探针结论明确（有/无）；
- [ ] 分支 A：实时滚动+折叠计时；分支 B：优雅降级归档；
- [ ] typecheck / test 全绿。
