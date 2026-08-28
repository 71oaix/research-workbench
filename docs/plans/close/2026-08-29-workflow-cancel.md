---
title: 工作流取消（停止按钮）（plan）
status: archived
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-workflow-cancel.md"
areas: [server, web]
---

# 工作流取消（停止按钮）（plan）

## 任务摘要
engine.cancel 置标志 + session.abort 中断活跃流；runner 关键节点 isCancelled 检查点（补 abort 窗口错过的盲区）；被取消步骤 skipped、半成品丢弃、不可重启；POST /workflows/:id/cancel（仅 executing）；前端头部停止按钮（红调，单击即停）

## Review 发现与修正
- [P3-cancel][major→已修] session.abort() 后 prompt 以 aborted **resolve**（非 reject），且 abort 只能中断活跃流——send 间隙取消会错过 → 修正：PiStepRunner 关键节点（createRuntime 后/各 send 前/commit 前）加 isCancelled 检查点，engine 暴露 isCancelled，index.ts 以 engineRef 晚绑定注入。
- [P3-cancel][minor→已修] skipRemaining 原只标 pending，当前 running 步漏标 → 条件扩展 (pending|running)。
- [P5-deepseek][✓] pi-ai 对 deepseek.com baseUrl / provider 'deepseek' 自动启用 thinkingFormat:'deepseek'（params.thinking 开关）；URL 拼 {base}/chat/completions 官方直接支持；reasoning_effort 真跑未报错。
- [P5-deepseek][minor→已修] cost 表同步官方非峰值价（0.22/0.66/0.007）。
- [P1-polish][nit→已修] 计时括号（Ns）从步骤 running 起算（组件挂载时刻），页面刷新后重新计时——接受。
- [P2-polish][✓] 40ms 帧距 + 正文滚底后"蹦字感"与"不跟手"消除。

## 实现要点
- server：PiRuntimeProvider（baseUrl/abort/cost/STREAM_FLUSH_MS）、piConfig（DEEPSEEK_API_KEY/deepseek 默认）、PiStepRunner（onStream/onCancellable/isCancelled 检查点）、WorkflowEngine（cancel/skipRemaining/isCancelled）、index.ts（cancel API + 装配）、prompts.ts（planner 澄清纪律收紧：能合理假设必须直接出完整计划——修复官方模型每题必澄清导致 researcher 解析失败）。
- web：CyclingLabel 计时括号、StreamPreview 滚底/max-height、预览显示条件、停止按钮、api/store cancel。
- 测试：engineCancel.test.ts ×2（取消链路/409）；piStepRunner×3 文件 send 签名断言同步。

## 测试与验证
- 全仓 199 测试绿；typecheck 干净
- 真跑：DeepSeek 官方 API 探针（thinking 39 帧/1178 字符）；
  取消端到端（selector 运行中取消 → 8s 内全 skipped、零半成品、cancelled 不可重启）
- CDP 截图：折叠条约 3k 字、停止按钮运行态渲染确认

## 验收标准
- [x] 全部达成（详见 issue 验收）
