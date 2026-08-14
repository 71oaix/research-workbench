import { useState } from 'react'
import type { Artifact } from '@research-workbench/shared'

const ARTIFACT_ORDER = [
  '01-plan.md',
  'research-cards.md',
  '02-research.md',
  'citation-lint.md',
  '03-draft.md',
  '04-review.md',
]

export function ArtifactTabs({ artifacts }: { artifacts: Artifact[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const ordered = [...artifacts].sort(
    (a, b) =>
      ARTIFACT_ORDER.indexOf(a.name) - ARTIFACT_ORDER.indexOf(b.name) ||
      a.createdAt.localeCompare(b.createdAt)
  )
  const current = ordered.find((artifact) => artifact.id === activeId) ?? ordered.at(-1) ?? null

  return (
    <section className="artifact-area">
      <div className="artifact-tabs">
        {ordered.map((artifact) => (
          <button
            key={artifact.id}
            className={artifact.id === current?.id ? 'active' : ''}
            onClick={() => setActiveId(artifact.id)}
          >
            {artifact.name} (v{artifact.version})
          </button>
        ))}
      </div>
      <pre className="artifact-content">{current?.content ?? '（暂无产物）'}</pre>
    </section>
  )
}
