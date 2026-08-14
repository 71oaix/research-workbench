import { randomUUID } from 'node:crypto'
import type {
  Artifact,
  Decision,
  Paper,
  Role,
  Step,
  StepStatus,
  UsageRecord,
  Workflow,
  WorkflowStatus,
} from '@research-workbench/shared'
import type { Db } from './db'

const now = () => new Date().toISOString()

export interface WorkflowRepository {
  create(goal: string): Workflow
  findById(id: string): Workflow | null
  list(): Workflow[]
  updateStatus(id: string, status: WorkflowStatus): Workflow | null
}

export interface StepRepository {
  create(input: {
    workflowId: string
    label: string
    role: Role
    position: number
    requiresApproval: boolean
    inputArtifacts?: string[]
  }): Step
  listByWorkflow(workflowId: string): Step[]
  updateStatus(id: string, status: StepStatus): Step | null
}

export interface ArtifactRepository {
  create(input: {
    workflowId: string
    stepId: string | null
    name: string
    content: string
  }): Artifact
  listByWorkflow(workflowId: string): Artifact[]
  nextVersion(workflowId: string, name: string): number
}

export interface PaperRepository {
  upsert(input: Omit<Paper, 'id' | 'createdAt'>): Paper
  list(): Paper[]
  findByExternalId(source: string, externalId: string): Paper | null
}

export interface DecisionRepository {
  create(input: {
    workflowId: string
    stepId: string | null
    type: Decision['type']
    note: string | null
  }): Decision
  listByWorkflow(workflowId: string): Decision[]
}

export interface UsageRepository {
  record(input: Omit<UsageRecord, 'id' | 'createdAt'>): UsageRecord
  listByWorkflow(workflowId: string): UsageRecord[]
}

export interface Repositories {
  workflows: WorkflowRepository
  steps: StepRepository
  artifacts: ArtifactRepository
  papers: PaperRepository
  decisions: DecisionRepository
  usage: UsageRepository
}

function mapWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: String(row.id),
    goal: String(row.goal),
    status: row.status as WorkflowStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapStep(row: Record<string, unknown>): Step {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    label: String(row.label),
    role: row.role as Role,
    status: row.status as StepStatus,
    position: Number(row.position ?? 0),
    requiresApproval: Number(row.requires_approval ?? 0) === 1,
    inputArtifacts: JSON.parse(String(row.input_artifacts ?? '[]')) as string[],
    outputArtifact: row.output_artifact ? String(row.output_artifact) : null,
    agentRuntimeId: row.agent_runtime_id ? String(row.agent_runtime_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    stepId: row.step_id ? String(row.step_id) : null,
    name: String(row.name),
    content: String(row.content ?? ''),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapPaper(row: Record<string, unknown>): Paper {
  return {
    id: String(row.id),
    source: String(row.source),
    externalId: String(row.external_id),
    title: String(row.title),
    abstract: row.abstract ? String(row.abstract) : null,
    authors: JSON.parse(String(row.authors ?? '[]')) as string[],
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    doi: row.doi ? String(row.doi) : null,
    arxivId: row.arxiv_id ? String(row.arxiv_id) : null,
    url: row.url ? String(row.url) : null,
    citationCount:
      row.citation_count === null || row.citation_count === undefined
        ? null
        : Number(row.citation_count),
    raw: row.raw ? String(row.raw) : null,
    createdAt: String(row.created_at),
  }
}

function mapDecision(row: Record<string, unknown>): Decision {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    stepId: row.step_id ? String(row.step_id) : null,
    type: row.type as Decision['type'],
    note: row.note ? String(row.note) : null,
    createdAt: String(row.created_at),
  }
}

function mapUsage(row: Record<string, unknown>): UsageRecord {
  return {
    id: String(row.id),
    workflowId: row.workflow_id ? String(row.workflow_id) : null,
    stepId: row.step_id ? String(row.step_id) : null,
    role: row.role ? (row.role as Role) : null,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    cacheReadTokens: Number(row.cache_read_tokens),
    cacheWriteTokens: Number(row.cache_write_tokens),
    costCny: Number(row.cost_cny),
    createdAt: String(row.created_at),
  }
}

export function createRepositories(db: Db): Repositories {
  return {
    workflows: {
      create(goal: string): Workflow {
        const id = randomUUID()
        const ts = now()
        db.prepare(
          'INSERT INTO workflows (id, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, goal, 'planning', ts, ts)
        return this.findById(id) as Workflow
      },
      findById(id: string): Workflow | null {
        const row = db
          .prepare('SELECT * FROM workflows WHERE id = ?')
          .get(id) as Record<string, unknown> | undefined
        return row ? mapWorkflow(row) : null
      },
      list(): Workflow[] {
        const rows = db
          .prepare('SELECT * FROM workflows ORDER BY created_at DESC')
          .all() as Record<string, unknown>[]
        return rows.map(mapWorkflow)
      },
      updateStatus(id: string, status: WorkflowStatus): Workflow | null {
        db.prepare(
          'UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?'
        ).run(status, now(), id)
        return this.findById(id)
      },
    },
    steps: {
      create(input: {
        workflowId: string
        label: string
        role: Role
        position: number
        requiresApproval: boolean
        inputArtifacts?: string[]
      }): Step {
        const id = randomUUID()
        const ts = now()
        db.prepare(
          `INSERT INTO steps
           (id, workflow_id, label, role, status, position, requires_approval,
            input_artifacts, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
        ).run(
          id,
          input.workflowId,
          input.label,
          input.role,
          input.position,
          input.requiresApproval ? 1 : 0,
          JSON.stringify(input.inputArtifacts ?? []),
          ts,
          ts
        )
        const row = db
          .prepare('SELECT * FROM steps WHERE id = ?')
          .get(id) as Record<string, unknown>
        return mapStep(row)
      },
      listByWorkflow(workflowId: string): Step[] {
        const rows = db
          .prepare('SELECT * FROM steps WHERE workflow_id = ? ORDER BY created_at')
          .all(workflowId) as Record<string, unknown>[]
        return rows.map(mapStep)
      },
      updateStatus(id: string, status: StepStatus): Step | null {
        db.prepare('UPDATE steps SET status = ?, updated_at = ? WHERE id = ?').run(
          status,
          now(),
          id
        )
        const row = db
          .prepare('SELECT * FROM steps WHERE id = ?')
          .get(id) as Record<string, unknown> | undefined
        return row ? mapStep(row) : null
      },
    },
    artifacts: {
      create(input: {
        workflowId: string
        stepId: string | null
        name: string
        content: string
      }): Artifact {
        const id = randomUUID()
        const ts = now()
        const version = this.nextVersion(input.workflowId, input.name)
        db.prepare(
          `INSERT INTO artifacts
           (id, workflow_id, step_id, name, content, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, input.workflowId, input.stepId, input.name, input.content, version, ts, ts)
        const row = db
          .prepare('SELECT * FROM artifacts WHERE id = ?')
          .get(id) as Record<string, unknown>
        return mapArtifact(row)
      },
      listByWorkflow(workflowId: string): Artifact[] {
        const rows = db
          .prepare('SELECT * FROM artifacts WHERE workflow_id = ? ORDER BY created_at')
          .all(workflowId) as Record<string, unknown>[]
        return rows.map(mapArtifact)
      },
      nextVersion(workflowId: string, name: string): number {
        const row = db
          .prepare(
            'SELECT COALESCE(MAX(version), 0) AS v FROM artifacts WHERE workflow_id = ? AND name = ?'
          )
          .get(workflowId, name) as { v: number }
        return Number(row.v) + 1
      },
    },
    papers: {
      upsert(input: Omit<Paper, 'id' | 'createdAt'>): Paper {
        const id = randomUUID()
        const ts = now()
        db.prepare(
          `INSERT INTO papers
           (id, source, external_id, title, abstract, authors, year, doi, url,
            arxiv_id, citation_count, raw, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source, external_id) DO UPDATE SET
             title = excluded.title,
             abstract = excluded.abstract,
             authors = excluded.authors,
             year = excluded.year,
             doi = excluded.doi,
             arxiv_id = excluded.arxiv_id,
             url = excluded.url,
             citation_count = excluded.citation_count,
             raw = excluded.raw`
        ).run(
          id,
          input.source,
          input.externalId,
          input.title,
          input.abstract,
          JSON.stringify(input.authors),
          input.year,
          input.doi,
          input.url,
          input.arxivId,
          input.citationCount,
          input.raw,
          ts
        )
        const found = this.findByExternalId(input.source, input.externalId)
        if (found) return found
        const row = db
          .prepare('SELECT * FROM papers WHERE id = ?')
          .get(id) as Record<string, unknown>
        return mapPaper(row)
      },
      list(): Paper[] {
        const rows = db
          .prepare('SELECT * FROM papers ORDER BY created_at DESC')
          .all() as Record<string, unknown>[]
        return rows.map(mapPaper)
      },
      findByExternalId(source: string, externalId: string): Paper | null {
        const row = db
          .prepare('SELECT * FROM papers WHERE source = ? AND external_id = ?')
          .get(source, externalId) as Record<string, unknown> | undefined
        return row ? mapPaper(row) : null
      },
    },
    decisions: {
      create(input: {
        workflowId: string
        stepId: string | null
        type: Decision['type']
        note: string | null
      }): Decision {
        const id = randomUUID()
        const ts = now()
        db.prepare(
          'INSERT INTO decisions (id, workflow_id, step_id, type, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, input.workflowId, input.stepId, input.type, input.note, ts)
        const row = db
          .prepare('SELECT * FROM decisions WHERE id = ?')
          .get(id) as Record<string, unknown>
        return mapDecision(row)
      },
      listByWorkflow(workflowId: string): Decision[] {
        const rows = db
          .prepare('SELECT * FROM decisions WHERE workflow_id = ? ORDER BY created_at')
          .all(workflowId) as Record<string, unknown>[]
        return rows.map(mapDecision)
      },
    },
    usage: {
      record(input: Omit<UsageRecord, 'id' | 'createdAt'>): UsageRecord {
        const id = randomUUID()
        const ts = now()
        db.prepare(
          `INSERT INTO usage_records
           (id, workflow_id, step_id, role, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, cost_cny, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          input.workflowId,
          input.stepId,
          input.role,
          input.inputTokens,
          input.outputTokens,
          input.cacheReadTokens,
          input.cacheWriteTokens,
          input.costCny,
          ts
        )
        const row = db
          .prepare('SELECT * FROM usage_records WHERE id = ?')
          .get(id) as Record<string, unknown>
        return mapUsage(row)
      },
      listByWorkflow(workflowId: string): UsageRecord[] {
        const rows = db
          .prepare('SELECT * FROM usage_records WHERE workflow_id = ? ORDER BY created_at')
          .all(workflowId) as Record<string, unknown>[]
        return rows.map(mapUsage)
      },
    },
  }
}
