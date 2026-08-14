import type { Artifact, Step } from '@research-workbench/shared'

export interface StepRunInput {
  step: Step
  inputArtifacts: Artifact[]
}

export interface StepRunResult {
  artifactName: string
  content: string
}

export interface StepRunner {
  run(input: StepRunInput): Promise<StepRunResult>
}

/**
 * M2-1 模拟执行器：延时后生成一份引用输入 artifact 的 markdown，
 * 用于验证“步骤 → artifact 交接 → 下一步”链路。M2-2 替换为真实 runner。
 */
export class FakeStepRunner implements StepRunner {
  constructor(private readonly delayMs = 200) {}

  async run({ step, inputArtifacts }: StepRunInput): Promise<StepRunResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    const refs =
      inputArtifacts.length > 0
        ? inputArtifacts.map((a) => `- ${a.name}（v${a.version}）`).join('\n')
        : '- （无）'
    const content = [
      `# ${step.label}（模拟产物）`,
      '',
      `- 角色: ${step.role}`,
      '- 输入 artifact:',
      refs,
    ].join('\n')
    return {
      artifactName: `${step.role}-${step.label}.md`.replace(/\s+/g, '-'),
      content,
    }
  }
}
