---
title: 真流式输出（plan）
status: active
created: 2026-08-29
updated: 2026-08-29
issue: "2026-08-29-streaming.md"
areas: [server, web, shared]
---

# 真流式输出（plan）

## 任务摘要
`PiRuntimeHandle.send` 订阅 pi `message_update` 差分增量 → 80ms 节流 → WS `step.stream` → store 缓冲 → 气泡流式渲染；`artifact.updated` 全量兜底。

## 为什么做
现状整块输出（`send()` await prompt 后抽全文）；pi SDK `message_update` 事件流现成未用。流式是本次演示最大体验增量。

## 预计效果
writer/planner 等步骤输出逐段流出，观感对齐 Claude；产物落库逻辑不变（不丢不重）。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 增量提取 | `message_update` 携带 partial message 全量 → 与上次长度差分 = delta；按 text 块拼接 | 解析 AssistantMessageEvent 的 delta 细节结构 | 差分对 provider 差异/自动重试/块序变化都鲁棒 |
| 节流 | 80ms 批量合并下发；seq per (workflowId,stepId) 单调递增 | 逐 token / 无节流 | WS 帧数与 React 渲染压力可控 |
| 事件设计 | `step.stream {workflowId, stepId, kind:'text'\|'thinking', delta, seq}` | 复用 artifact.updated | artifact 语义是"定稿"，流是"过程"；kind 预留 Issue 3 |
| 前端渲染 | store 按 stepId 缓冲 → 运行中气泡内流式预览（MarkdownView 重渲 + ▍光标）；`artifact.updated` 清缓冲并整块替换 | 增量 patch markdown | 简单可靠；重渲成本可接受（14.5px 文档级内容） |
| 断线 | 不续传；重连后对账 + artifact 兜底 | seq 重传窗口 | 演示场景可接受，复杂度不成比例 |
| 兜底 | 订阅/差分任何异常 → 静默关闭该步流式，回退整块模式 | 抛错 | 零回归保底 |
| 范围 | 仅 text；summarizer（确定性）与工具内部不流 | 全量流 | summarizer 无模型调用 |

## 实现步骤
1. `packages/shared/src/ws-protocol.ts`：ServerEvent 增 `step.stream`；
2. `PiRuntimeProvider.ts`：`send(prompt, onDelta?: (delta: string) => void)`——prompt 前记录 messages 基线 + `session.subscribe`；`message_update` 差分 text 长度 → 80ms 节流批调 onDelta；finally 退订；异常时置 `streamDisabled` 静默；
3. `PiStepRunner.ts`：构造器加 `onStream?(workflowId, stepId, kind, delta)`；`handle.send(prompt, d => onStream(step.workflowId, step.id, 'text', d))`（两处）；`MockStepRunner` 加可选参数恒不发射；
4. `index.ts`：装配 `onStream` → seq 计数（Map<stepId, number>）→ bus.emit `step.stream`（bus→WS 广播链路已有）；
5. `store.ts`：state 增 `streamBuffers: Record<stepId, string>`；applyServerEvent 加 case（append）；`artifact.updated`/`step.updated`（status 变更）时清除该 step buffer；`selectWorkflow` 全清；
6. `ChatFlow.tsx`：运行中步骤且 buffer 非空 → 气泡内流式预览区（md-body 样式 + 尾部 ▍ 光标 CSS 闪烁）；**优先级规则：流缓冲非空 → 预览；空 → 现状（无骨架，shimmer 已砍）**；`artifact.updated` 后正常卡片渲染（buffer 已清）；
7. 回归：现有路径（无 onDelta）行为完全不变。

## Review 发现与修正
- [minor] 差分无消息身份键：auto-retry 时新 assistant message 文本归零会产生负 delta → 修正：`message_start` 重置基线，长度差分仅在单条消息内；**优先直接使用 `assistantMessageEvent` 自带的 `text_delta`/`thinking_delta`（pi-ai types 已有类型），差分仅作回退**。
- [minor] 节流定时器泄漏：finally 退订后 pending timer 可能再 flush 一次孤儿 delta → 修正：同一 finally 内取消 pending timer。
- [minor] WS 广播不分工作流：store 侧 `step.stream` 需 gate `event.workflowId === detail.workflow.id`；且 buffer 清理须在 `artifact.updated`/`step.updated` 现有 early-return **之前**执行。
- [minor]（跨 P1）运行态优先级：流缓冲非空 → 流式预览；否则骨架/空白——规则写入本 plan 步骤 6，P1 砍掉 shimmer（被流式预览取代）。
- [✓] message_update 确认穿透 AgentSessionEvent；subscribe 返回退订函数；send 恰两处调用点；noTools='all' 无工具循环（单条 assistant message/prompt）；196 测试数字准确。

## 测试与验证
- 单测：差分函数（跨块/重置/长度回退）、节流批合并（fake timers）、store buffer append/clear、seq 单调；
- 真实验证：`verify-m4-1.mjs` 加 `--watch` 打印增量帧统计（帧数/字节数/首帧延迟）；
- 既有 196 测试零回归；CDP 录制流式过程截图。

## 验收标准
- [ ] 真跑一轮：writer 可见流式 ≥20 帧、首帧 <3s；
- [ ] 断 WS 重连产物完整；
- [ ] 异常回退不崩；
- [ ] 全绿 + 零回归。
