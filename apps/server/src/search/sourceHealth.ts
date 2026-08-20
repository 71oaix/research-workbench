/**
 * 源级健康注册表（进程内）：某源被判定稳定失效后，在冷却期内跳过其请求，
 * 冷却结束自动重探（成功即恢复）。避免每个查询都对一个已知失效的源做无谓尝试。
 */
export class SourceHealthRegistry {
  private readonly downUntil = new Map<string, number>()

  constructor(private readonly cooldownMs: number) {}

  markDown(source: string): void {
    this.downUntil.set(source, Date.now() + this.cooldownMs)
  }

  isDown(source: string): boolean {
    const until = this.downUntil.get(source)
    if (until === undefined) return false
    if (Date.now() >= until) {
      this.downUntil.delete(source)
      return false
    }
    return true
  }

  clear(source: string): void {
    this.downUntil.delete(source)
  }
}
