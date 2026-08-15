import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from '../engine/eventBus'
import type { StepRunInput, StepRunResult, StepRunner } from '../engine/StepRunner'
import { ARTIFACT_NAMES } from './prompts'

export class MockStepRunner implements StepRunner {
  constructor(
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus
  ) {}

  async run({ step, goal, feedback }: StepRunInput): Promise<StepRunResult> {
    await sleep(350)
    const artifactName = ARTIFACT_NAMES[step.role]
    switch (step.role) {
      case 'planner':
        return { artifactName, content: mockPlan(goal, feedback ?? null) }
      case 'researcher': {
        this.persist(step.workflowId, step.id, 'research-cards.md', mockCards())
        return { artifactName, content: mockResearch() }
      }
      case 'writer':
        return { artifactName, content: mockDraft(feedback ?? null) }
      case 'reviewer': {
        this.persist(step.workflowId, step.id, 'citation-lint.md', mockLint())
        return { artifactName, content: mockReview() }
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

function mockCards(): string {
  const lines = [
    '# 检索证据卡片（确定性管道）',
    '',
    '## 检索概览',
    '- 命中 / 去重：20 / 10（演示）',
    '- 失败源：无',
    '',
    '## 论文卡片',
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
