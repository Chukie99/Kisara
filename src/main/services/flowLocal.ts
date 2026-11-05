import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const LOCAL_BASE = 'http://127.0.0.1:8765'
let starting: Promise<void> | null = null

async function ready(): Promise<boolean> {
  try {
    const response = await fetch(LOCAL_BASE + '/health', { signal: AbortSignal.timeout(2000) })
    if (!response.ok) return false
    const health = await response.json() as { backend_running?: boolean; active_tokens?: number }
    return health.backend_running === true || typeof health.active_tokens === 'number'
  } catch { return false }
}

/** Start only the known local installation; never launch a process for a custom endpoint. */
export async function ensureLocalFlow(baseUrl: string): Promise<void> {
  if (baseUrl.replace(/\/$/, '') !== LOCAL_BASE) return
  if (starting) return starting
  starting = (async () => {
    if (await ready()) return
    const launcher = join(app.getAppPath(), 'tools', 'flow2api', 'START-FLOW2API.ps1')
    if (process.platform !== 'win32' || !existsSync(launcher)) {
      throw new Error('Server Flow lokal belum berjalan. Instalasi Flow2API tidak ditemukan di folder Kisara; jalankan servermu terlebih dahulu.')
    }
    await new Promise<void>((resolve, reject) => {
      // The launcher checks the port and health before spawning Python, and never kills another listener.
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcher],
        { windowsHide: true, timeout: 40000, maxBuffer: 128 * 1024 },
        error => error ? reject(new Error('Server Flow belum berhasil menyala otomatis. Periksa server.stderr.log di folder tools/flow2api, lalu coba Hubungkan server lokal lagi.')) : resolve())
    })
    if (!await ready()) throw new Error('Server Flow belum siap setelah dinyalakan. Coba Hubungkan server lokal lagi.')
  })()
  try { await starting } finally { starting = null }
}
