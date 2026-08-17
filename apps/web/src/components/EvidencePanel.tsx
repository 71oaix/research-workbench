import type { Artifact } from '@research-workbench/shared'
import { parseConcernLedger, summarizeConcerns } from '@research-workbench/shared'

export function EvidencePanel({ artifacts }: { artifacts: Artifact[] }) {
  const cards = artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const lint = artifacts.find((artifact) => artifact.name === 'citation-lint.md')
  const evaluation = artifacts.find((artifact) => artifact.name === 'evaluation-report.md')
  const review = artifacts.find((artifact) => artifact.name === '04-review.md')
  const concerns = review ? parseConcernLedger(review.content) : []
  const concernSummary = concerns.length > 0 ? summarizeConcerns(concerns) : null

  return (
    <aside className="pane-right">
      <h2>证据 / 引用</h2>
      {cards ? (
        <dl>
          <dt>检索概览</dt>
          <dd>{extractLine(cards.content, '命中 / 去重') ?? '（无）'}</dd>
          <dd>{extractLine(cards.content, '失败源') ?? '（无）'}</dd>
        </dl>
      ) : (
        <p className="placeholder">尚未检索</p>
      )}
      {lint ? (
        <dl>
          <dt>引用检查</dt>
          <dd>{extractLine(lint.content, '有效引用编号') ?? '（无）'}</dd>
          <dd>{extractLine(lint.content, '越界 / 缺失编号') ?? '（无）'}</dd>
        </dl>
      ) : (
        <p className="placeholder">尚无引用检查</p>
      )}
      {evaluation ? (
        <dl>
          <dt>评估报告</dt>
          <dd>{extractLine(evaluation.content, '主题匹配') ?? '（无）'}</dd>
          <dd>
            {extractLine(evaluation.content, '平均相关度') ?? ''}
            {extractLine(evaluation.content, '平均相关度') ? ' ｜ ' : ''}
            {extractLine(evaluation.content, '大纲覆盖') ?? ''}
          </dd>
          <dd>{extractLine(evaluation.content, '来源失败') ?? ''}</dd>
        </dl>
      ) : (
        <p className="placeholder">尚无评估报告</p>
      )}
      {review ? (
        <dl>
          <dt>审查意见</dt>
          {concernSummary ? (
            <dd>
              Blocking {concernSummary.blocking} ｜ Major {concernSummary.major} ｜ Minor{' '}
              {concernSummary.minor}
            </dd>
          ) : (
            <dd>（未解析到 Concern Ledger）</dd>
          )}
        </dl>
      ) : (
        <p className="placeholder">尚无审查意见</p>
      )}
    </aside>
  )
}

function extractLine(content: string, key: string): string | null {
  const line = content.split('\n').find((item) => item.includes(key))
  return line?.trim() ?? null
}
