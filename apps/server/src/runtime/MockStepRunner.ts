import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from '../engine/eventBus'
import type { StepRunInput, StepRunResult, StepRunner } from '../engine/StepRunner'
import { ARTIFACT_NAMES } from './prompts'

// 演示模式的模拟用量：成本面板（运行总览）在 DEMO 下有数据可展示
const MOCK_USAGE: Record<string, { input: number; output: number; cost: number }> = {
  planner: { input: 1800, output: 900, cost: 0.021 },
  researcher: { input: 2400, output: 1200, cost: 0.028 },
  selector: { input: 8200, output: 2600, cost: 0.084 },
  writer: { input: 12400, output: 5200, cost: 0.153 },
  evaluator: { input: 6400, output: 1500, cost: 0.062 },
  reviewer: { input: 4200, output: 1100, cost: 0.041 },
  summarizer: { input: 3100, output: 800, cost: 0.03 },
}

export class MockStepRunner implements StepRunner {
  constructor(
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus
  ) {}

  async run({ step, goal, feedback }: StepRunInput): Promise<StepRunResult> {
    await sleep(350)
    const usage = MOCK_USAGE[step.role]
    if (usage) {
      const record = this.repos.usage.record({
        workflowId: step.workflowId,
        stepId: step.id,
        role: step.role,
        inputTokens: usage.input,
        outputTokens: usage.output,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costCny: usage.cost,
      })
      this.bus.emit({ type: 'usage.recorded', usage: record })
    }
    const artifactName = ARTIFACT_NAMES[step.role]
    switch (step.role) {
      case 'planner':
        return { artifactName, content: mockPlan(goal, feedback ?? null) }
      case 'researcher': {
        this.persist(step.workflowId, step.id, 'research-candidates.md', mockCandidates())
        return { artifactName, content: mockResearch() }
      }
      case 'selector': {
        this.persist(step.workflowId, step.id, 'research-cards.md', mockCards() + mockOfficialDocsSection())
        this.persist(step.workflowId, step.id, 'selector-report.md', mockSelectorReport())
        return { artifactName, content: mockCards() }
      }
      case 'writer':
        return { artifactName, content: mockDraft(feedback ?? null) }
      case 'evaluator': {
        this.persist(step.workflowId, step.id, 'evaluation-report.md', mockEvaluation())
        // 演示评估回环：第一轮低分（触发引擎自动重写 writer），二评高分（收敛）
        const pass = this.repos.artifacts
          .listByWorkflow(step.workflowId)
          .filter((a) => a.name === 'evaluation-scores.md').length
        this.persist(
          step.workflowId,
          step.id,
          'evaluation-scores.md',
          pass > 0 ? mockScoresSecondPass() : mockScoresFirstPass()
        )
        return { artifactName, content: mockEvaluation() }
      }
      case 'reviewer': {
        this.persist(step.workflowId, step.id, 'citation-lint.md', mockLint())
        return { artifactName, content: mockReview() }
      }
      case 'summarizer': {
        this.persist(step.workflowId, step.id, '05-summary.md', mockSummary())
        this.persist(
          step.workflowId,
          step.id,
          'references.bib',
          '@article{research1,\n  title = {演示论文 1},\n  author = {作者 A},\n  year = {2024},\n}\n'
        )
        return { artifactName, content: mockSummary() }
      }
    }
  }

  private persist(workflowId: string, stepId: string, name: string, content: string): void {
    const artifact = this.repos.artifacts.create({ workflowId, stepId, name, content })
    this.bus.emit({ type: 'artifact.updated', artifact })
  }
}

function mockPlan(goal: string, feedback: string | null): string {
  const lines = [
    '# 检索计划（演示）',
    '',
    '## 研究问题',
    goal,
    '',
    '## 子问题',
    '- 问题一：现状如何',
    '- 问题二：关键方法',
    '- 问题三：开放挑战',
    '',
    '## 检索关键词',
    '- LLM agent evaluation',
    '- RAG 大模型幻觉',
    '- 软件测试自动化',
    '',
    '## 综述大纲',
    '- 引言',
    '- 方法',
    '- 结论',
  ]
  if (feedback) {
    lines.splice(2, 0, '', '## 修改响应', `已按审批意见修订：${feedback}`)
  }
  return lines.join('\n')
}

function mockCandidates(): string {
  const lines = [
    '# 检索候选池（演示）',
    '',
    '## 检索概览',
    '- 命中 / 去重：20 / 10（演示）',
    '- 失败源：无',
    '',
    '## 候选论文',
    '',
  ]
  for (let index = 1; index <= 10; index++) {
    lines.push(
      `### [${index}] 演示论文 ${index}`,
      `- 年份：2024 | 引用数：${1000 - index * 10} | 来源：mock`,
      `- DOI：10.1000/demo.${index}`,
      '- 作者：作者 A、作者 B',
      `- 摘要：这是第 ${index} 篇演示论文的摘要，用于演示证据卡片结构。`,
      ''
    )
  }
  return lines.join('\n')
}

function mockCards(): string {
  const lines = [
    '# 检索证据卡片（确定性管道）',
    '',
    '## 检索概览',
    '- 命中 / 去重：20 / 10（演示）',
    '- 筛选：候选 10 篇 → 入选 5 篇（高相关 3 / 部分相关 2）',
    '- 失败源：无',
    '',
    '## 论文卡片',
    '',
  ]
  for (let index = 1; index <= 5; index++) {
    lines.push(
      `### [${index}] 演示论文 ${index}`,
      `- 年份：2024 | 引用数：${1000 - index * 10} | 来源：mock | 相关度：${
        index <= 3 ? '高' : '部分'
      }`,
      `- DOI：10.1000/demo.${index}`,
      '- 作者：作者 A、作者 B',
      `- 摘要：这是第 ${index} 篇演示论文的摘要，用于演示证据卡片结构。`,
      `- 筛选理由：与主题相关（演示）`,
      ''
    )
  }
  return lines.join('\n')
}

function mockSelectorReport(): string {
  return [
    '# 筛选报告（演示）',
    '',
    '- 候选池：10 篇',
    '- 入选：5 篇（高相关 3 / 部分相关 2）',
    '- 剔除：5 篇',
    '',
    '## 入选清单',
    '- [1] 演示论文 1（高）：与主题高度相关（演示）',
  ].join('\n')
}

function mockResearch(): string {
  return [
    '# 检索结果（演示）',
    '',
    '## 检索概览',
    '- 数据源：semantic-scholar、openalex（演示）',
    '- 命中 / 去重：20 / 10',
    '- 失败源：无',
    '',
    '## 论文卡片',
    '### [1] 演示论文 1',
    '### [2] 演示论文 2',
    '### [3] 演示论文 3',
    '### [4] 演示论文 4',
    '### [5] 演示论文 5',
  ].join('\n')
}

function mockDraft(feedback: string | null): string {
  const lines = [
    '# 综述初稿（演示）',
    '',
    '## 引言',
    '大语言模型相关研究发展迅速，评测与检索方法不断演进 [1][2]。',
    '',
    '## 方法',
    '现有工作主要分为三类：检索增强、评测基准与智能体编排 [3][4]。',
    '',
    '## 讨论',
    '证据显示仍需更多可复现评测 [5]。',
    '',
    '## 小结',
    '本综述基于 5 篇证据 [1][2][3][4][5]。',
    '',
    '## 参考文献',
    '- [1] 演示论文 1（2024）DOI: 10.1000/demo.1',
    '- [2] 演示论文 2（2024）DOI: 10.1000/demo.2',
    '- [3] 演示论文 3（2024）DOI: 10.1000/demo.3',
    '- [4] 演示论文 4（2024）DOI: 10.1000/demo.4',
    '- [5] 演示论文 5（2024）DOI: 10.1000/demo.5',
  ]
  if (feedback) {
    lines.splice(2, 0, '', '## 修改响应', `已按审批意见修订：${feedback}`)
  }
  return lines.join('\n')
}

function mockLint(): string {
  return [
    '# 引用检查报告',
    '',
    '- 草稿引用次数：6',
    '- 去重后引用编号：5',
    '- 证据卡片编号范围：1-10',
    '- 有效引用编号：1, 2, 3, 4, 5',
    '- 越界 / 缺失编号：（无）',
    '',
    '## 引用频次',
    '- [1]：2 次',
    '- [2]：2 次',
    '- [3]：1 次',
    '- [4]：1 次',
    '- [5]：2 次',
    '',
    '## 结论',
    '所有引用编号均在证据卡片范围内。',
  ].join('\n')
}

function mockEvaluation(): string {
  return [
    '# 评估报告（演示）',
    '',
    '## 逐核心概念命中判定',
    '| 概念 | 判定 | 依据卡片 | 理由 |',
    '|------|------|----------|------|',
    '| 智能体记忆分类 | 命中 | [1][2] | 摘要直接覆盖短期/长期记忆分类 |',
    '',
    '## 逐卡相关度评分',
    '| 编号 | 标题 | 评分 | 依据 |',
    '|------|------|------|------|',
    '| [1] | 演示论文 1 | 5 | 与主题高度相关 |',
    '',
    '## 大纲覆盖',
    '| 计划章节 | 判定 | 内容锚点 | 理由 |',
    '|----------|------|----------|------|',
    '| 引言 | 覆盖 | [1] | 章节引用了卡片 |',
    '',
    '## 覆盖不足方向与 gap 建议',
    '- 建议补充近两年文献。',
    '',
    '## 总体结论',
    '- 通过：证据与草稿一致。',
  ].join('\n')
}

function mockReview(): string {
  return [
    '# 审查意见（演示）',
    '',
    '## 可信引用清单',
    '- [1]-[5] 均在证据卡片范围内，标题与摘要一致。',
    '',
    '## 存疑引用与原因',
    '- 无。',
    '',
    '## 覆盖不足的方向',
    '- 可补充近两年文献与中文语料。',
    '',
    '## 总体结论',
    '- 建议通过。',
  ].join('\n')
}

function mockSummary(): string {
  return [
    '# 调研结果摘要（演示）',
    '',
    '- 证据卡片：5 篇（高相关 3 / 部分相关 2）',
    '',
    '## 主题分组',
    '### 智能体记忆',
    '- 主组：[1][2]（相关：[3]）',
    '',
    '## 相关度分级',
    '- 高相关（3）：[1][2][3]',
    '- 部分相关（2）：[4][5]',
    '',
    '## 引用清单',
    '- [1] 演示论文 1（2024）｜作者 A｜10.1000/demo.1',
  ].join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 演示：第一轮评估低分（触发引擎评估回环，自动重写 writer） */
function mockScoresFirstPass(): string {
  return [
    '## 六维完整评分（规则口径，0-5）',
    '',
    '| 维度 | 评分 | 说明 |',
    '|------|------|------|',
    '| 主题匹配 | 3.2 | 部分章节依赖泛化证据 |',
    '| 相关度 | 3.0 | 若干卡片仅标题层面相关 |',
    '| 大纲覆盖 | 3.1 | 3.5/4.5 章节证据不足 |',
    '| 引用可信 | 4 | 编号均在卡片范围内 |',
    '| 来源失败 | 4 | 1 个来源降级 |',
    '| 完整性 | 2 | 「框架实践对比」章节无证据落地 |',
    '| 综合 | 2.9 | 六维平均（0-5） |',
  ].join('\n')
}

/** 演示：二评高分（回环收敛） */
function mockScoresSecondPass(): string {
  return [
    '## 六维完整评分（规则口径，0-5）',
    '',
    '| 维度 | 评分 | 说明 |',
    '|------|------|------|',
    '| 主题匹配 | 4 | 章节与主题对应良好 |',
    '| 相关度 | 3.8 | 高相关为主 |',
    '| 大纲覆盖 | 3.9 | 各章节均有证据锚点 |',
    '| 引用可信 | 4 | 编号均在卡片范围内 |',
    '| 来源失败 | 4 | 1 个来源降级 |',
    '| 完整性 | 4 | 缺失章节已补充支撑 |',
    '| 综合 | 3.8 | 六维平均（0-5） |',
  ].join('\n')
}

/** 演示：官方文档参考附加段（真实运行由 officialDocs.ts 抓取生成，格式一致） */
function mockOfficialDocsSection(): string {
  return [
    '',
    '## 官方文档参考（不进引用编号与核验序列）',
    '',
    '> 以下内容来自框架官方文档（一手来源），用于补充学术文献覆盖稀疏的工程实践类子问题；写作中引用时请标注“（依据 XX 官方文档）”。',
    '',
    '### 子问题 3 的官方文档参考',
    '',
    '#### Memory（演示）',
    '',
    '- 来源：Mem0 官方文档（' + new Date().toISOString().slice(0, 10) + ' 访问）',
    '- 链接：https://docs.mem0.ai/',
    '',
    '这是官方文档正文摘录的演示文本：Mem0 提供分层记忆管理 API，支持用户级与会话级记忆的抽取、更新与检索（演示截断至 2000 字符以内）。',
    '',
  ].join('\n')
}
