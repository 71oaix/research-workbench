import path from 'node:path'
import type { Repositories } from '@research-workbench/data'
import type { WorkflowEventBus } from '../engine/eventBus'
import { acquireFullText, fullTextKey, resolvePdfUrls } from '../evidence/fullText'
import { extractThemeTokens, hasIntersection, tokenize } from '../evidence/evaluation'
import type { AcademicSearchService } from './AcademicSearchService'
import { buildResearchCards } from './cards'
import type { SearchConfig } from './config'
import type { ResearcherStepService } from './types'

export class ResearcherStepServiceImpl implements ResearcherStepService {
  constructor(
    private readonly search: AcademicSearchService,
    private readonly repos: Repositories,
    private readonly bus: WorkflowEventBus,
    private readonly config: SearchConfig
  ) {}

  async prepare(input: {
    workflowId: string
    stepId: string
    planContent: string
    compensate?: boolean
  }): Promise<{ cardsMd: string }> {
    const output = await this.search.search(input.planContent, {
      compensate: input.compensate ?? false,
    })
    output.papers = filterRelevantPapers(output.papers, input.planContent)

    const fullTextByKey = new Map<string, string>()
    const candidates = output.papers.filter((paper) => resolvePdfUrls(paper).length > 0)
    const toDownload = candidates.slice(0, this.config.downloadMax)
    const deadline = Date.now() + this.config.downloadTimeoutMs
    await mapWithConcurrency(toDownload, 3, async (paper) => {
      if (Date.now() > deadline) {
        paper.downloadStatus = 'failed'
        paper.downloadError = '下载时间预算耗尽'
        return
      }
      const acquired = await acquireFullText(paper, {
        dir: path.join(process.cwd(), 'data', 'pdfs'),
        maxChars: this.config.fullTextMaxChars,
      })
      paper.fullText = acquired.result?.text ?? null
      paper.downloadStatus = acquired.result ? 'ok' : acquired.reason
      paper.downloadError =
        acquired.reason === 'failed'
          ? `全部候选下载失败或提取文本不足（候选 ${resolvePdfUrls(paper).length} 个）`
          : null
      if (acquired.result?.text) fullTextByKey.set(fullTextKey(paper), acquired.result.text)
    })

    for (const paper of output.rawPapers) {
      const text = fullTextByKey.get(fullTextKey(paper))
      if (text) paper.fullText = text
      if (!paper.downloadStatus) {
        const top = candidates.find(
          (candidate) => fullTextKey(candidate) === fullTextKey(paper)
        )
        if (top) {
          paper.downloadStatus = top.downloadStatus ?? null
          paper.downloadError = top.downloadError ?? null
        }
      }
      this.repos.papers.upsert(paper)
    }

    const cardsMd = buildResearchCards(output.papers, output.stats, output.groups)
    const cardsArtifact = this.repos.artifacts.create({
      workflowId: input.workflowId,
      stepId: input.stepId,
      name: 'research-cards.md',
      content: cardsMd,
    })
    this.bus.emit({ type: 'artifact.updated', artifact: cardsArtifact })

    const fullTextMd = buildFullTextMd(output.papers)
    if (fullTextMd) {
      const artifact = this.repos.artifacts.create({
        workflowId: input.workflowId,
        stepId: input.stepId,
        name: 'paper-fulltext.md',
        content: fullTextMd,
      })
      this.bus.emit({ type: 'artifact.updated', artifact })
    }

    this.bus.emit({
      type: 'search.completed',
      workflowId: input.workflowId,
      stepId: input.stepId,
      stats: output.stats,
    })

    return { cardsMd }
  }
}

function filterRelevantPapers<T extends { title: string; abstract: string | null }>(
  papers: T[],
  planMd: string
): T[] {
  const theme = extractThemeTokens(planMd)
  if (theme.size === 0 || papers.length === 0) return papers
  const relevant = papers.filter((paper) =>
    hasIntersection(tokenize(`${paper.title} ${paper.abstract ?? ''}`.slice(0, 400)), theme)
  )
  return relevant.length > 0 ? relevant : papers
}

function buildFullTextMd(
  papers: {
    title: string
    fullText?: string | null
    downloadStatus?: 'ok' | 'no_oa' | 'failed' | null
    downloadError?: string | null
  }[]
): string {
  const withText = papers.filter((paper) => Boolean(paper.fullText))
  const failed = papers.filter((paper) => paper.downloadStatus === 'failed')
  if (withText.length === 0) return ''
  const sections = withText.map(
    (paper, index) => `## [${index + 1}] ${paper.title}\n\n${paper.fullText}`
  )
  const header = [
    '# 论文全文（阅读证据）',
    '',
    `- 下载：成功 ${withText.length} 篇`,
    failed.length > 0
      ? `- 失败 ${failed.length} 篇（${failed
          .map((paper) => `${paper.title.slice(0, 40)}: ${paper.downloadError ?? '未知原因'}`)
          .join('；')}）`
      : '',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
  return [header, ...sections].join('\n\n')
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++
        await fn(items[index])
      }
    }
  )
  await Promise.all(workers)
}
