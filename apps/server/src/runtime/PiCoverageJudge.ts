import type { PiRuntimeProvider } from './PiRuntimeProvider'
import { buildJudgePrompt, parseJudgeOutput, type CoverageJudge } from '../search/coverageJudge'

const JUDGE_TIMEOUT_MS = Number(process.env.PI_JUDGE_TIMEOUT_MS ?? 90_000)

const JUDGE_SYSTEM_PROMPT = [
  '你是学术调研工作台的覆盖判定员。',
  '你只做一件事：判断子问题是否被候选论文支撑。',
  '你不使用任何工具。输出只有一个 JSON 数组，禁止任何多余文字、解释或 Markdown 代码块标记。',
].join('\n')

/**
 * 生产级模型辅助覆盖判定：一次性建 selector 角色会话（无工具），
 * 批量精判非 covered 行；超时/异常返回 null（调用方回退规则结果）。
 */
export class PiCoverageJudge implements CoverageJudge {
  constructor(private readonly provider: PiRuntimeProvider) {}

  async judge(input: {
    questions: { id: number; question: string }[]
    papers: { id: number; title: string; abstract: string }[]
  }) {
    if (input.questions.length === 0 || input.papers.length === 0) return null
    const maxPaperId = Math.max(...input.papers.map((paper) => paper.id))
    const handle = await this.provider.createRuntime('selector', JUDGE_SYSTEM_PROMPT)
    try {
      const prompt = buildJudgePrompt(input.questions, input.papers, [])
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), JUDGE_TIMEOUT_MS)
      )
      const output = await Promise.race([handle.send(prompt), timeout])
      if (!output) return null
      const verdicts = parseJudgeOutput(output, maxPaperId)
      return verdicts.length > 0 ? verdicts : null
    } catch {
      return null
    } finally {
      await handle.close()
    }
  }
}
