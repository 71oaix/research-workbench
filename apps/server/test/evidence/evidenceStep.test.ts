import { describe, expect, it, vi } from 'vitest'
import type { Artifact, ServerEvent, Step } from '@research-workbench/shared'
import { createDb, createRepositories } from '@research-workbench/data'
import { createEventBus } from '../../src/engine/eventBus'
import { EvidenceStepServiceImpl } from '../../src/evidence/EvidenceStepService'

function makeArtifact(name: string, content: string): Artifact {
  return {
    id: `a-${name}`,
    workflowId: 'wf-1',
    stepId: null,
    name,
    content,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function makeStep(role: Step['role']): Step {
  return {
    id: 'step-1',
    workflowId: 'wf-1',
    label: role,
    role,
    status: 'pending',
    position: 0,
    requiresApproval: false,
    inputArtifacts: [],
    outputArtifact: null,
    agentRuntimeId: null,
    pendingFeedback: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('EvidenceStepServiceImpl', () => {
  it('prepareWriter returns a prompt section with the evidence cards', async () => {
    const repos = createRepositories(createDb())
    const bus = createEventBus()
    const service = new EvidenceStepServiceImpl(repos, bus)
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper A'].join('\n')
    )

    const result = await service.prepareWriter({
      workflowId: 'wf-1',
      stepId: 'step-1',
      inputArtifacts: [cards],
    })

    expect(result.promptExtra).toContain('证据池（仅以此为事实来源）')
    expect(result.promptExtra).toContain('### [1] Paper A')
    expect(repos.artifacts.listByWorkflow('wf-1')).toHaveLength(0)
  })

  it('injects a machine-generated evidence status list into the writer prompt', async () => {
    const repos = createRepositories(createDb())
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const cards = makeArtifact(
      'research-cards.md',
      [
        '# cards',
        '',
        '### [1] Paper A',
        '- 年份：2025 | 引用数：10 | 来源：arxiv | 全文：已读',
        '',
        '### [2] Paper B',
        '- 年份：2025 | 引用数：5 | 来源：crossref | 全文：下载失败（全部候选下载失败或提取文本不足（候选 1 个））',
        '',
        '### [3] Paper C',
        '- 年份：2024 | 引用数：3 | 来源：openalex | 全文：仅摘要',
      ].join('\n')
    )

    const result = await service.prepareWriter({
      workflowId: 'wf-1',
      stepId: 'step-1',
      inputArtifacts: [cards],
    })

    expect(result.promptExtra).toContain('证据状态（机器生成，必须照抄）')
    expect(result.promptExtra).toContain('全文已读：[1]')
    expect(result.promptExtra).toContain('下载失败：[2]（全部候选下载失败')
    expect(result.promptExtra).toContain('仅摘要：[3]')
    expect(result.promptExtra).toContain('必须与“证据状态”清单一致')
  })

  it('prepareReviewer creates citation-lint.md and includes the model evaluation report', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((event) => events.push(event))
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查引用',
      role: 'reviewer',
      position: 2,
      requiresApproval: true,
    })
    const service = new EvidenceStepServiceImpl(repos, bus)
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper A', '### [2] Paper B'].join('\n')
    )
    const draft = makeArtifact('03-draft.md', 'draft uses [1] and [99]')
    const evaluation = makeArtifact('evaluation-report.md', '# 评估报告（模型生成）\n- gap：共享记忆专项缺失')

    const result = await service.prepareReviewer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [cards, draft, evaluation],
    })

    expect(result.promptExtra).toContain('自动引用检查报告')
    expect(result.promptExtra).toContain('越界 / 缺失编号：99')
    expect(result.promptExtra).toContain('模型评估报告')
    expect(result.promptExtra).toContain('共享记忆专项缺失')
    const lint = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'citation-lint.md')
    expect(lint?.content).toContain('引用检查报告')
    expect(
      repos.artifacts
        .listByWorkflow(workflow.id)
        .filter((artifact) => artifact.name === 'evaluation-report.md')
    ).toHaveLength(0)
    expect(events.some((event) => event.type === 'artifact.updated')).toBe(true)
  })

  it('prepareEvaluator builds reference data for the model evaluator', async () => {
    const repos = createRepositories(createDb())
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '评估证据',
      role: 'evaluator',
      position: 1,
      requiresApproval: false,
    })
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const plan = makeArtifact(
      '01-plan.md',
      ['## 锚定点', '### 核心概念', '- 多智能体共享记忆', '## 综述大纲', '1. 引言', '2. 共享记忆机制'].join('\n')
    )
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper A', '- 摘要：shared memory 多智能体'].join('\n')
    )
    const draft = makeArtifact('03-draft.md', '草稿使用 [1]')

    const result = await service.prepareEvaluator({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [plan, cards, draft],
    })

    expect(result.promptExtra).toContain('评估材料')
    expect(result.promptExtra).toContain('规则统计参考')
    expect(result.promptExtra).toContain('多智能体共享记忆')
    expect(result.promptExtra).toContain('综述草稿（评估对象）')
    expect(result.promptExtra).toContain('六维完整评分')
  })

  it('throws when required artifacts are missing', async () => {
    const repos = createRepositories(createDb())
    const service = new EvidenceStepServiceImpl(repos, createEventBus())

    await expect(
      service.prepareWriter({ workflowId: 'wf-1', stepId: 's', inputArtifacts: [] })
    ).rejects.toThrow('research-cards.md')
    await expect(
      service.prepareReviewer({ workflowId: 'wf-1', stepId: 's', inputArtifacts: [] })
    ).rejects.toThrow('research-cards.md')
  })

  it('prepareReviewer supports the no-draft research template (证据调研审查)', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查证据',
      role: 'reviewer',
      position: 0,
      requiresApproval: true,
    })
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper A', '- 相关度：高'].join('\n')
    )
    const evaluation = makeArtifact('evaluation-report.md', '# 评估报告')

    const result = await service.prepareReviewer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [cards, evaluation],
    })

    expect(result.promptExtra).toContain('无草稿')
    expect(result.promptExtra).toContain('证据调研审查')
    const names = repos.artifacts.listByWorkflow(workflow.id).map((artifact) => artifact.name)
    expect(names).not.toContain('citation-lint.md')
    expect(names).not.toContain('citation-verification.md')
  })

  it('prepareSummarizer builds 05-summary.md and references.bib from cards', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((event) => events.push(event))
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '归纳整理',
      role: 'summarizer',
      position: 0,
      requiresApproval: false,
    })
    const service = new EvidenceStepServiceImpl(repos, bus)
    const plan = makeArtifact(
      '01-plan.md',
      ['## 锚定点', '- 多智能体共享记忆', '## 子问题', '- 记忆如何组织'].join('\n')
    )
    const cards = makeArtifact(
      'research-cards.md',
      [
        '# cards',
        '',
        '### [1] Paper A',
        '- 年份：2024 | 引用数：10 | 来源：openalex | 相关度：高',
        '- 作者：Alice',
        '- DOI：10.1/a',
        '- 摘要：multi-agent shared memory',
        '',
        '### [2] Paper B',
        '- 年份：2023 | 引用数：5 | 来源：crossref',
        '- 作者：Bob',
        '- DOI：10.1/b',
        '- 摘要：unrelated survey',
      ].join('\n')
    )

    const result = await service.prepareSummarizer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [plan, cards],
    })

    expect(result.summaryMd).toContain('# 调研结果摘要')
    expect(result.summaryMd).toContain('## 主题分组')
    expect(result.summaryMd).toContain('## 引用清单')
    expect(result.summaryMd).toContain('高相关（1）')
    const names = repos.artifacts.listByWorkflow(workflow.id).map((artifact) => artifact.name)
    expect(names).toContain('05-summary.md')
    expect(names).toContain('references.bib')
    const bib = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'references.bib')
    expect(bib?.content).toContain('@article{research1')
    expect(bib?.content).toContain('doi = {10.1/a}')
    expect(events.some((event) => event.type === 'artifact.updated')).toBe(true)
  })

  it('prepareWriter merges multiple research-cards versions into one pool', async () => {
    const repos = createRepositories(createDb())
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const oldCards = makeArtifact('research-cards.md', '### [1] Paper A')
    const newCards = makeArtifact('research-cards.md', '### [1] Paper A')
    const newVersion = {
      ...newCards,
      id: 'a-new',
      version: 2,
      createdAt: '2026-08-15T00:01:00.000Z',
    }

    const result = await service.prepareWriter({
      workflowId: 'wf-1',
      stepId: 'step-1',
      inputArtifacts: [oldCards, newVersion],
    })

    expect(result.promptExtra).toContain('合并卡片数：1')
    expect(result.promptExtra).toContain('来源版本：v1, v2')
  })

  it('does not fail the service when the draft has no citations', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查',
      role: 'reviewer',
      position: 0,
      requiresApproval: true,
    })
    const cards = makeArtifact('research-cards.md', '### [1] Paper A')
    const draft = makeArtifact('03-draft.md', 'no citations')

    const result = await service.prepareReviewer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [cards, draft],
    })
    expect(result.promptExtra).toContain('未发现 [编号] 引用')
  })

  it('injects only top-3 full-text excerpts and truncates long sections', async () => {
    const repos = createRepositories(createDb())
    const service = new EvidenceStepServiceImpl(repos, createEventBus())
    const longBody = 'lorem ipsum '.repeat(2000)
    const fullText = makeArtifact(
      'paper-fulltext.md',
      [
        '# 论文全文（阅读证据）',
        '- 下载：成功 5 篇',
        '',
        `## [1] Paper One\n\n${longBody}`,
        `## [2] Paper Two\n\n${longBody}`,
        `## [3] Paper Three\n\n${longBody}`,
        `## [4] Paper Four\n\n${longBody}`,
        `## [5] Paper Five\n\n${longBody}`,
      ].join('\n\n')
    )
    const cards = makeArtifact(
      'research-cards.md',
      ['# cards', '', '### [1] Paper One', '### [5] Paper Five'].join('\n')
    )

    const result = await service.prepareWriter({
      workflowId: 'wf-1',
      stepId: 'step-1',
      inputArtifacts: [cards, fullText],
    })

    expect(result.promptExtra).toContain('### [1] Paper One')
    expect(result.promptExtra).toContain('### [3] Paper Three')
    expect(result.promptExtra).not.toContain('### [4] Paper Four')
    expect(result.promptExtra).toContain('中间部分省略')
    expect(result.promptExtra).toContain('其余论文只用摘要')
  })

  it('generates citation-verification.md and injects it when verifier deps are provided', async () => {
    const db = createDb()
    const repos = createRepositories(db)
    const bus = createEventBus()
    const events: ServerEvent[] = []
    bus.on((event) => events.push(event))
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '审查引用',
      role: 'reviewer',
      position: 2,
      requiresApproval: true,
    })
    const verifierDeps = {
      lookupDoi: vi.fn().mockResolvedValue(null),
      searchByTitleAuthor: vi.fn().mockResolvedValue(null),
      lookupArxiv: vi.fn().mockResolvedValue(null),
    }
    const service = new EvidenceStepServiceImpl(repos, bus, verifierDeps)
    const cards = makeArtifact('research-cards.md', '### [1] Paper A')
    const draft = makeArtifact('03-draft.md', 'draft uses [1]')

    const result = await service.prepareReviewer({
      workflowId: workflow.id,
      stepId: step.id,
      inputArtifacts: [cards, draft],
    })

    expect(result.promptExtra).toContain('自动引用核验报告')
    const verification = repos.artifacts
      .listByWorkflow(workflow.id)
      .find((artifact) => artifact.name === 'citation-verification.md')
    expect(verification?.content).toContain('引用核验报告')
    expect(events.some((event) => event.type === 'artifact.updated')).toBe(true)
  })
})
