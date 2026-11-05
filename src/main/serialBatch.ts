/** Stop later queued work before it can submit after any failed/canceled item. */
export class StopOnFailureBatch {
  private stopped = false
  async run<T>(signal: AbortSignal, cancel: () => Promise<void>, task: () => Promise<T>): Promise<T> {
    if (this.stopped) { await cancel(); signal.throwIfAborted(); throw new Error('Antrean dihentikan setelah pekerjaan sebelumnya gagal.') }
    try { signal.throwIfAborted(); return await task() }
    catch (error) { this.stopped = true; throw error }
  }
}
