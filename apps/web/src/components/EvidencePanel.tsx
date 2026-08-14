import type { Artifact } from '@research-workbench/shared'

export function EvidencePanel({ artifacts }: { artifacts: Artifact[] }) {
  const cards = artifacts.find((artifact) => artifact.name === 'research-cards.md')
  const lint = artifacts.find((artifact) => artifact.name === 'citation-lint.md')

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
    </aside>
  )
}

function extractLine(content: string, key: string): string | null {
  const line = content.split('\n').find((item) => item.includes(key))
  return line?.trim() ?? null
}
