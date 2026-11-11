/** Lease one browser account per video; preserve in-flight results when another account fails. */
export class FlowVideoBatch {
  private available: number[]
  private stopped = false
  private waiters = new Set<() => void>()
  constructor(accounts: number[]) {
    if (!accounts.length || new Set(accounts).size !== accounts.length) throw new Error('Antrean akun video tidak valid.')
    this.available = accounts.slice(0, 3)
  }
  private wake(): void { for (const resolve of this.waiters) resolve(); this.waiters.clear() }
  async run<T>(signal: AbortSignal, cancel: () => Promise<void>, task: (account: number) => Promise<T>): Promise<T> {
    let account: number | undefined
    try {
      while (!this.available.length && !this.stopped) {
        signal.throwIfAborted()
        await new Promise<void>((resolve, reject) => {
          const done = (): void => { signal.removeEventListener('abort', abort); this.waiters.delete(done); resolve() }
          const abort = (): void => { this.waiters.delete(done); reject(signal.reason) }
          this.waiters.add(done)
          signal.addEventListener('abort', abort, { once: true })
        })
      }
      if (this.stopped) { await cancel(); signal.throwIfAborted(); throw new Error('Antrean video dihentikan setelah pekerjaan sebelumnya gagal.') }
      signal.throwIfAborted()
      account = this.available.shift()!
      return await task(account)
    } catch (error) { this.stopped = true; throw error }
    finally { if (account !== undefined) this.available.push(account); this.wake() }
  }
}
