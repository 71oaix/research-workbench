export class RateLimiter {
  private nextAt = 0

  constructor(private readonly minIntervalMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now()
    const wait = Math.max(0, this.nextAt - now)
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
    this.nextAt = Math.max(now, this.nextAt) + this.minIntervalMs
  }
}
