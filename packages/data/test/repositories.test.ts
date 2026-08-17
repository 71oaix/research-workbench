import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db'
import { createRepositories } from '../src/repositories'

describe('repositories', () => {
  it('creates and updates a workflow', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研 LLM 在软件测试中的应用')
    expect(workflow.status).toBe('planning')

    const updated = repos.workflows.updateStatus(workflow.id, 'executing')
    expect(updated?.status).toBe('executing')
    expect(repos.workflows.findById(workflow.id)?.goal).toContain('LLM')
  })

  it('creates steps and artifacts with versioning', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('测试')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '检索文献',
      role: 'researcher',
      position: 0,
      requiresApproval: false,
    })
    expect(step.status).toBe('pending')

    const v1 = repos.artifacts.create({
      workflowId: workflow.id,
      stepId: step.id,
      name: 'research.md',
      content: 'v1',
    })
    const v2 = repos.artifacts.create({
      workflowId: workflow.id,
      stepId: step.id,
      name: 'research.md',
      content: 'v2',
    })
    expect(v1.version).toBe(1)
    expect(v2.version).toBe(2)
  })

  it('upserts papers by source + externalId', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const first = repos.papers.upsert({
      source: 'semantic-scholar',
      externalId: 'abc',
      title: 'Paper A',
      abstract: 'abstract',
      authors: ['A'],
      year: 2024,
      doi: '10.1/abc',
      arxivId: null,
      url: 'https://example.com/a',
      citationCount: 3,
      raw: null,
    })
    const second = repos.papers.upsert({
      source: 'semantic-scholar',
      externalId: 'abc',
      title: 'Paper A updated',
      abstract: null,
      authors: ['A', 'B'],
      year: 2024,
      doi: '10.1/abc',
      arxivId: '2401.12345v2',
      url: null,
      citationCount: 5,
      raw: null,
    })
    expect(second.id).toBe(first.id)
    expect(second.title).toBe('Paper A updated')
    expect(second.citationCount).toBe(5)
    expect(second.arxivId).toBe('2401.12345v2')
  })

  it('reads and writes pending feedback on steps', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '规划',
      role: 'planner',
      position: 0,
      requiresApproval: true,
    })
    expect(step.pendingFeedback).toBeNull()

    const updated = repos.steps.setPendingFeedback(step.id, '补充方向')
    expect(updated?.pendingFeedback).toBe('补充方向')
    expect(repos.steps.listByWorkflow(workflow.id)[0].pendingFeedback).toBe('补充方向')

    const cleared = repos.steps.setPendingFeedback(step.id, null)
    expect(cleared?.pendingFeedback).toBeNull()
  })

  it('persists paper full text', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const paper = repos.papers.upsert({
      source: 'arxiv',
      externalId: '1706.03762',
      title: 'Attention Is All You Need',
      abstract: 'abstract',
      authors: ['Ashish Vaswani'],
      year: 2017,
      doi: null,
      arxivId: '1706.03762',
      url: 'https://arxiv.org/abs/1706.03762',
      citationCount: 100000,
      fullText: 'We propose a new architecture.',
      raw: null,
    })
    expect(paper.fullText).toBe('We propose a new architecture.')
    expect(
      repos.papers.findByExternalId('arxiv', '1706.03762')?.fullText
    ).toBe('We propose a new architecture.')
  })

  it('persists download status and error', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const paper = repos.papers.upsert({
      source: 'arxiv',
      externalId: '1706.03762',
      title: 'Attention Is All You Need',
      abstract: null,
      authors: ['Ashish Vaswani'],
      year: 2017,
      doi: null,
      arxivId: '1706.03762',
      url: 'https://arxiv.org/abs/1706.03762',
      citationCount: 100000,
      downloadStatus: 'failed',
      downloadError: '全部候选下载失败（候选 2 个）',
      raw: null,
    })
    expect(paper.downloadStatus).toBe('failed')
    expect(paper.downloadError).toContain('候选 2 个')
    expect(repos.papers.findByExternalId('arxiv', '1706.03762')?.downloadStatus).toBe('failed')
  })

  it('updates step status atomically only when the expected status matches', () => {
    const db = createDb()
    const repos = createRepositories(db)
    const workflow = repos.workflows.create('调研')
    const step = repos.steps.create({
      workflowId: workflow.id,
      label: '规划',
      role: 'planner',
      position: 0,
      requiresApproval: true,
    })
    expect(repos.steps.updateStatusWhere(step.id, 'awaiting_approval', 'approved')).toBeNull()
    repos.steps.updateStatus(step.id, 'awaiting_approval')
    expect(
      repos.steps.updateStatusWhere(step.id, 'awaiting_approval', 'approved')?.status
    ).toBe('approved')
    expect(repos.steps.updateStatusWhere(step.id, 'awaiting_approval', 'rejected')).toBeNull()
  })
})
