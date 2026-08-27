---
title: 引用 [n] 可溯源交互（plan）
status: archived
created: 2026-08-28
updated: 2026-08-28
issue: "docs/issues/close/2026-08-28-citation-affordance.md"
areas: [web]
---

# 引用 [n] 可溯源交互（plan）

## 任务摘要
综述草稿中的行内引用 `[n]` 渲染为可交互上标标记：视觉分级（核验状态着色）、hover 显示
论文题名+核验结论、点击定位证据卡并脉冲高亮。

## 为什么做
"每句引用可溯源"是产品与"大模型直出综述"的本质差异，但 UI 对此零表达——引用编号与
正文同色同重、不可交互。评委/用户无法感知核心卖点。数据已齐备：
`citation-verification.md`（逐条 status/level/confidence 表格）+ `research-cards.md`
（编号→论文卡），只缺呈现层。

## 预计效果
- 阅读草稿时每处引用"跳出来"且可信度一目了然；
- hover 即得论文信息，点击即达证据，形成"引用→证据"闭环动线。

## Review 发现与修正
- [major] sup 变换若放在 inline() 全局执行会波及评估报告/摘要等产物的 `[n]` 字面文本 →
  修正：仅当传入 `citations` prop（writer 气泡）时才做上标变换，否则保持字面渲染。
- [major] 核验表格实际为 5 列 `| 编号 | 状态 | 级别 | 置信度 | 摘要 |`，状态为英文
  verified/check_suggested/needs_fix/unverifiable（citationVerifier.ts:379-402），且编号单元格
  可能是 `[V1-3]（归一化为 [3]）` → 修正：解析 5 列格式，映射 needs_fix→bad /
  check_suggested→warn / unverifiable→unknown / verified→verified；优先取"归一化为 [n]"
  的编号；不合规行静默跳过（该条降级 unknown）。
- [minor] `[n]` 变换需跳过 `<code>` 区间（行内代码中的 [n] 不应可交互）→ 修正：cite 替换
  最后执行并排除 code 片段。

## 关键决策
| 决策点 | 选择 | 放弃 | 理由 |
|---|---|---|---|
| 解析数据源 | citation-verification.md 表格（status/confidence）；缺失时降级统一样式 | 04-review.md A/B/C 分层（正则脆弱） | 表格是结构化输出，解析稳定 |
| 卡片数据源 | 复用 PaperCards.parseCards（导出）解析 research-cards.md | 新建解析器 | 单一事实源 |
| 交互实现 | MarkdownView 输出 `<sup data-cite="n">` + 容器事件委托；tooltip 用 CSS（.cite-tip） | 每引用 React 组件/第三方 tooltip | 保持白名单字符串渲染架构；CSS tooltip 零依赖 |
| 点击定位 | 滚动到 selector 气泡内 `data-card-id=n` 元素并加 .cite-flash 类 1.6s | 打开侧栏文件 | 动线最近；侧栏已有文件跳转兜底 |
| 越界编号 | 保留渲染但灰色不可点（title 提示"未在证据卡中"） | 不渲染 | 如实暴露问题比隐藏好（覆盖门哲学） |
| 作用范围 | 仅 writer 草稿气泡启用（citations prop 门控） | 全局所有产物 | 摘要/评估中的 [n] 是清单文本非行内引用 |

## 实现步骤
1. `PaperCards.tsx`：导出 `parseCards`（保持原名导出），卡片根元素加 `data-card-id={card.id}`；
2. `MarkdownView.tsx`：
   - 新增 `citations?: Map<number, CiteMeta>` prop（CiteMeta={title, year, status, confidence}）；
   - **仅当 citations 存在**：inline 产物 HTML 后处理——排除 `<code>`/`<pre>` 区间，
     把 `[n]`/`[n][m]` 连续组替换为
     `<sup class="cite-mark" data-cite="n" data-status="…"><span class="cite-tip">…</span>[n]</sup>`；
   - 容器 onClick 事件委托：target.closest('.cite-mark') 时回调 `onCiteClick(id)`；
3. `index.css`：`.cite-mark`（accent 上标、pointer、hover 底色）、status 变体
   （verified=accent / warn=warn / bad=bad / unknown=ink3）、`.cite-tip`（深底白字圆角气泡）、
   `.cite-flash` 脉冲 keyframes；
4. 新建 `apps/web/src/lib/citations.ts`：`parseVerificationTable(md)`——按 5 列表格解析，
   编号优先取 `归一化为 [n]`，状态映射 needs_fix→bad/check_suggested→warn/
   unverifiable→unknown/verified→verified，不合规行跳过；
5. `ChatFlow.tsx` StepBubble：
   - writer 气泡组装 citations：parsePaperCards(research-cards 最新版) +
     parseVerificationTable(citation-verification.md 最新版)；
   - 传给 MarkdownView；onCiteClick → 定位 `#step-<selectorStepId>` 内
     `[data-card-id="n"]` scrollIntoView + flash 类；
6. 评估/审查/摘要等产物不传 citations prop，`[n]` 保持字面文本（门控保证）。

## 测试与验证
- 新增 `test/citation.test.tsx`：`[2][13]` 组渲染两个 sup；XSS 内容 `[<script>]` 转义；
  verification 缺失降级 data-status=unknown；onCiteClick 携带正确编号；
- 手工验证：真实工作流 2e4d0d85 草稿 hover 出 tooltip、点击滚到证据卡并闪烁；
- typecheck + web test 全绿。

## 验收标准
- [ ] 草稿所有 [n] 均为可交互上标，verified/warn/bad/unknown 四态可视区分
- [ ] hover 显示题名+年份+核验状态；点击定位证据卡并脉冲高亮
- [ ] 无 verification 数据时优雅降级，无报错
- [ ] XSS 回归通过；typecheck / test 全绿
