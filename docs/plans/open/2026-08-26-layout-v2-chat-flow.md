---
title: 布局重构 v2：对话流 + 右侧进度跳转 + 版本 tab + 文件 tab（plan）
status: active
created: 2026-08-26
updated: 2026-08-26
issue: "docs/issues/open/2026-08-26-layout-v2-chat-flow.md"
areas: [web]
---

# 布局重构 v2：对话流 + 右侧进度跳转 + 版本 tab + 文件 tab（plan）

## 任务摘要
把现网三栏重排为"中间对话流 + 右侧控制区（进度跳转/文件tab）+ 左导航"，卡片内版本 tab 切迭代，图标用自绘 SVG。

## 为什么做
现网中间大片空白、右栏狭窄难读、产物无法在中间阅读；用户已确认 v2.6 方案（mockup `ui-redesign-v2.html`）。
参照 Codex / DeepSeek 的对话框形态：中间是阅读重心，右侧是控制与进度，迭代收敛在单卡内。

## 预计效果
- 中间对话流，每步产物可读，无空白浪费;
- 右侧进度可点击跳转，文件 tab 可定位;
- 同产物多版本卡片内切换，对话流不拉长;
- 图标统一自绘 SVG，风格一致。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 布局 | 左导航 / 中对话流 / 右控制 | 原三栏(中步骤+审批 / 右产物) | 中间放阅读，右放控制与进度 |
| 审批位置 | 对应步骤气泡内联审批卡 | 独立底部大卡 | 跟内容走，符合对话流 |
| 版本 tab | 卡片内 ver-tabs 切 v1/v2 | 每迭代新开卡 | 避免对话流冗长 |
| 图标 | 自绘 SVG 组件 | lucide | 用户明确要求自绘，风格统一 |
| 产物渲染 | 复用 MarkdownView / PaperCards | 新写渲染器 | 复用成熟组件 |

## Review 发现与修正
- [major] 每步气泡都要"该步产物"，如何定位产物 → 修正：用 step.outputArtifact 名 + stepId 关联产物；无产物显示"该步骤未产出"。
- [major] 版本 tab 数据来源 → 修正：按产物 name 聚合多版本(Artifact 已有 version 字段)，版本 tab 项=版本号。
- [major] 右侧进度跳转需要气泡唯一 id → 修正：气泡 id=step.id，ProgressRail 点击滚动到对应元素。
- [minor] 输入框在澄清/打回时要能提交 → 修正：composer 复用 store.createWorkflow 与 feedback 提示；澄清用内联审批意见而非 composer。
- [minor] 图标过多 → 修正：建一个 icons 组件集，只画需要的 12 个，stroke 统一 1.8。

## 实现步骤
1. `icons.tsx`：自绘 SVG 图标集（plan/search/filter/pen/scale/shield/layers/user/plus/file/spinner）。
2. `ChatFlow.tsx`：按步骤渲染气泡（role icon + status + 该步产物 + 可选内联审批 + 版本 ver-tabs）。
3. `ProgressRail.tsx`：右侧执行进度（可点击跳转 step 气泡）。
4. `ArtifactFileTabs.tsx`：产物文件列表（点击在对话流定位/查看）。
5. `App.tsx`：布局改为 [sidebar | ChatFlow(in center) | (ProgressRail + FileTabs)] + 底部 composer。
6. 复用 ApprovalPanel / PaperCards / MarkdownView / WorkflowList。

## 测试与验证
- web 单测：ChatFlow 渲染步骤气泡与版本切换；ProgressRail 点击滚动；各状态文案。
- 复现：`npm run typecheck --workspace @research-workbench/web && npm test --workspace @research-workbench/web`。

## 验收标准
- [ ] 中间对话流，每步产物可读，无空白浪费
- [ ] 右侧进度点击跳转到对应气泡
- [ ] 同产物多版本卡片内 tab 切换
- [ ] 产物文件 tab 定位/查看
- [ ] 图标为自绘 SVG
- [ ] typecheck / test 全绿

## 文档更新清单
- `docs/guide/runbook.md`：布局说明。

## 涉及 UI/预览
重构主界面；预览 `http://localhost:5173`；图标为自绘 SVG。
