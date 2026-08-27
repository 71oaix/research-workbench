import type { CoverageRow } from './coverage'

export interface JudgeQuestion {
  id: number
  question: string
}

export interface JudgePaper {
  id: number
  title: string
  abstract: string
}

export interface JudgeVerdict {
  id: number
  coverage: 'covered' | 'partial' | 'missing'
  papers: number[]
}

/** 模型辅助覆盖判定：规则先跑，非 covered 行批量交模型精判；任何失败由调用方回退规则结果。 */
export interface CoverageJudge {
  judge(input: {
    questions: JudgeQuestion[]
    papers: JudgePaper[]
  }): Promise<JudgeVerdict[] | null>
}

const COVERAGE_VALUES = new Set(['covered', 'partial', 'missing'])

/**
 * 解析模型判定输出（容错）：提取首个 JSON 数组，
 * 校验 coverage 值域、过滤越界 id（防幻觉引用不存在的论文）。
 */
export function parseJudgeOutput(output: string, maxPaperId: number): JudgeVerdict[] {
  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(output.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const verdicts: JudgeVerdict[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const id = typeof rec.id === 'number' ? rec.id : Number(rec.id)
    if (!Number.isInteger(id) || id < 1 || !COVERAGE_VALUES.has(String(rec.coverage))) continue
    const rawPapers = Array.isArray(rec.papers) ? rec.papers : []
    const papers = [
      ...new Set(
        rawPapers
          .map((value) => (typeof value === 'number' ? value : Number(value)))
          .filter((value) => Number.isInteger(value) && value >= 1 && value <= maxPaperId)
      ),
    ]
    verdicts.push({ id, coverage: rec.coverage as JudgeVerdict['coverage'], papers })
  }
  return verdicts
}

/**
 * 用模型结论升级规则矩阵行（仅替换送审的行；papers 列表原样采用模型结果）。
 * 未出现在 verdicts 里的行保持规则结果。
 */
export function refineCoverage(rows: CoverageRow[], verdicts: JudgeVerdict[]): CoverageRow[] {
  const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]))
  return rows.map((row) => {
    const verdict = byId.get(row.id)
    if (!verdict) return row
    return { ...row, coverage: verdict.coverage, papers: verdict.papers.slice(0, 5) }
  })
}

export function buildJudgePrompt(
  questions: JudgeQuestion[],
  papers: JudgePaper[],
  bilingualAnchors: string[]
): string {
  const paperLines = papers
    .map((paper) => `- [${paper.id}] ${paper.title}｜${paper.abstract.slice(0, 600)}`)
    .join('\n')
  const questionLines = questions.map((question) => `- 子问题${question.id}: ${question.question}`).join('\n')
  return [
    '你是学术调研的覆盖判定员。任务：判断每个子问题是否被候选论文池支撑。',
    '',
    '# 子问题',
    questionLines,
    '',
    '# 候选论文（[编号] 标题｜摘要）',
    paperLines,
    bilingualAnchors.length > 0 ? `\n# 中英对照锚点\n${bilingualAnchors.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    '判定标准：',
    '- covered：存在直接支撑该子问题核心内容的论文（方法/场景/评测与之对应）。',
    '- partial：仅有侧面/间接相关论文。',
    '- missing：论文池中没有任何相关论文。',
    '注意：中英文标题与摘要都要看，锚点可帮助跨语言匹配。不要编造论文编号，只允许引用上面列出的编号。',
    '',
    '输出要求：仅输出 JSON 数组，格式 [{"id":1,"coverage":"covered","papers":[1,3]}]，无其他文字。',
  ]
    .filter(Boolean)
    .join('\n')
}
