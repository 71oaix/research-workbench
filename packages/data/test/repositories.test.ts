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
      url: null,
      citationCount: 5,
      raw: null,
    })
    expect(second.id).toBe(first.id)
    expect(second.title).toBe('Paper A updated')
    expect(second.citationCount).toBe(5)
  })
})
