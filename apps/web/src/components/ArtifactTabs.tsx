import { useState } from 'react'
import type { Artifact } from '@research-workbench/shared'

interface ArtifactMeta {
  group: string
  label: string
  description: string
}

const ARTIFACT_META: Record<string, ArtifactMeta> = {
  '01-plan.md': {
    group: '规划',
    label: '检索计划',
    description: 'Planner 生成：研究问题、锚定点、子问题、检索关键词、综述大纲。',
  },
  'research-cards.md': {
    group: '检索证据',
    label: '证据卡片',
    description: '确定性检索管道产物：论文卡片、检索概览与失败源。',
  },
  '02-research.md': {
    group: '检索证据',
    label: '文献清单',
    description: 'Researcher 整理的论文清单（仅含卡片内的论文）。',
  },
  'paper-fulltext.md': {
    group: '全文',
    label: '论文全文',
    description: '已下载并提取的论文全文（阅读证据），默认折叠。',
  },
  'citation-lint.md': {
    group: '引用核验',
    label: '引用检查',
    description: '自动检查引用编号是否在证据池范围内。',
  },
  'citation-verification.md': {
    group: '引用核验',
    label: '引用核验',
    description: 'Crossref / arXiv 字段级交叉核验，输出分级与置信度。',
  },
  'evaluation-report.md': {
    group: '评估',
    label: '评估报告',
    description: '主题匹配门禁、相关度、大纲覆盖、来源失败。',
  },
  '03-draft.md': {
    group: '草稿',
    label: '综述初稿',
    description: 'Writer 基于证据池与全文撰写的综述初稿，可对比上一版。',
  },
  '04-review.md': {
    group: '审查',
    label: '审查意见',
    description: 'Reviewer 的可信引用清单、存疑引用与 Concern Ledger。',
  },
}

const GROUP_ORDER = ['规划', '检索证据', '全文', '引用核验', '评估', '草稿', '审查']

interface GroupedArtifact {
  name: string
  meta: ArtifactMeta
  versions: Artifact[]
}

export function ArtifactTabs({ artifacts }: { artifacts: Artifact[] }) {
  const [activeName, setActiveName] = useState<string | null>(null)
  const [compare, setCompare] = useState(false)
  const [showFullText, setShowFullText] = useState(false)

  const grouped = groupArtifacts(artifacts)
  const current = grouped.find((item) => item.name === activeName) ?? grouped.at(-1) ?? null
  const latest = current?.versions.at(-1) ?? null
  const previous =
    current && current.versions.length > 1
      ? current.versions[current.versions.length - 2]
      : null

  const isFullText = latest?.name === 'paper-fulltext.md'
  const collapsed = isFullText && !showFullText && (latest?.content.length ?? 0) > 4000
  const display = collapsed
    ? `${latest?.content.slice(0, 2000) ?? ''}\n…（全文已折叠，点击展开）`
    : (latest?.content ?? '（暂无产物）')

  return (
    <section className="artifact-area">
      <div className="artifact-groups">
        {GROUP_ORDER.map((group) => {
          const items = grouped.filter((item) => item.meta.group === group)
          if (items.length === 0) return null
          return (
            <div key={group} className="artifact-group">
              <span className="artifact-group-label">{group}</span>
              <div className="artifact-tabs">
                {items.map((item) => (
                  <button
                    key={item.name}
                    className={item.name === current?.name ? 'active' : ''}
                    onClick={() => {
                      setActiveName(item.name)
                      setCompare(false)
                    }}
                  >
                    {item.meta.label}
                    {item.versions.length > 1 ? ` (v${item.versions.length})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {current && latest && (
        <div className="artifact-meta">
          <span className="artifact-description">{current.meta.description}</span>
          {previous && (
            <button className="diff-toggle" onClick={() => setCompare((value) => !value)}>
              {compare ? '收起对比' : '对比上一版'}
            </button>
          )}
        </div>
      )}
      {compare && latest && previous ? (
        <StructureDiff prev={previous.content} next={latest.content} />
      ) : (
        <pre className="artifact-content">{display}</pre>
      )}
      {isFullText && collapsed && (
        <button className="expand-fulltext" onClick={() => setShowFullText(true)}>
          展开全文
        </button>
      )}
    </section>
  )
}

function groupArtifacts(artifacts: Artifact[]): GroupedArtifact[] {
  const byName = new Map<string, GroupedArtifact>()
  for (const artifact of [...artifacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const meta =
      ARTIFACT_META[artifact.name] ?? {
        group: '其他',
        label: artifact.name,
        description: `产物文件：${artifact.name}`,
      }
    const existing = byName.get(artifact.name)
    if (existing) {
      existing.versions.push(artifact)
    } else {
      byName.set(artifact.name, { name: artifact.name, meta, versions: [artifact] })
    }
  }
  return [...byName.values()].sort(
    (a, b) => GROUP_ORDER.indexOf(a.meta.group) - GROUP_ORDER.indexOf(b.meta.group)
  )
}

function StructureDiff({ prev, next }: { prev: string; next: string }) {
  const prevHeads = headings(prev)
  const nextHeads = headings(next)
  const prevRefs = refs(prev)
  const nextRefs = refs(next)
  const removedHeads = prevHeads.filter((heading) => !nextHeads.includes(heading))
  const addedHeads = nextHeads.filter((heading) => !prevHeads.includes(heading))
  const removedRefs = prevRefs.filter((ref) => !nextRefs.includes(ref))
  const addedRefs = nextRefs.filter((ref) => !prevRefs.includes(ref))

  return (
    <div className="structure-diff">
      <h4>结构差异（上一版 → 当前版）</h4>
      {removedHeads.length > 0 && <p>移除章节：{removedHeads.join('；')}</p>}
      {addedHeads.length > 0 && <p>新增章节：{addedHeads.join('；')}</p>}
      {removedRefs.length > 0 && <p>不再引用的编号：{removedRefs.join(', ')}</p>}
      {addedRefs.length > 0 && <p>新增引用的编号：{addedRefs.join(', ')}</p>}
      {removedHeads.length === 0 && addedHeads.length === 0 && <p>章节结构无变化</p>}
    </div>
  )
}

function headings(md: string): string[] {
  return (md.match(/^#{2,3} .+$/gm) ?? []).map((heading) =>
    heading.replace(/^#+\s*/, '').trim()
  )
}

function refs(md: string): string[] {
  return [...new Set([...md.matchAll(/\[(\d{1,4})\]/g)].map((match) => match[1]))]
}
