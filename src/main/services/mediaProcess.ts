import { execFile } from 'node:child_process'

/** Keep one cancellation listener only while the child is alive, including error/timeout paths. */
export function runMediaProcess(file: string, args: string[], options: { signal?: AbortSignal; name: string; maxBuffer: number; timeoutMs: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const { signal } = options
    if (signal?.aborted) { reject(new Error('Dibatalkan')); return }
    const stop = (): void => { child.kill('SIGKILL') }
    const child = execFile(file, args, { windowsHide: true, maxBuffer: options.maxBuffer, timeout: options.timeoutMs }, (error, _stdout, stderr) => {
      signal?.removeEventListener('abort', stop)
      if (signal?.aborted) { reject(new Error('Dibatalkan')); return }
      if (error) {
        const detail = String(stderr ?? '').trim().split('\n').slice(-3).join(' ')
        reject(new Error(error.killed ? `${options.name} melewati batas waktu. Coba bagian lebih pendek.` : `${options.name} gagal: ${detail || 'Proses tidak selesai.'}`))
        return
      }
      resolve(String(stderr))
    })
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
  })
}
