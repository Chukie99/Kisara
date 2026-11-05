import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from '../paths'

type RoutingState = Record<string, { current?: number; exhausted: number[]; transientUntil?: Record<number, number> }>
const filename = (): string => join(dataDir(), 'flow-browser-accounts.json')
function read(): RoutingState {
  try {
    if (!existsSync(filename())) return {}
    const value = JSON.parse(readFileSync(filename(), 'utf8')) as RoutingState
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(v => !v || !Array.isArray(v.exhausted) || v.exhausted.some(id => !Number.isInteger(id) || id <= 0) || v.current !== undefined && (!Number.isInteger(v.current) || v.current <= 0))) throw new Error()
    return value
  } catch { throw new Error('Status kuota akun Flow tidak dapat dibaca. Periksa folder data Kisara.') }
}
function save(value: RoutingState): void {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(filename() + '.tmp', JSON.stringify(value))
  renameSync(filename() + '.tmp', filename())
}
/** Keep using one account across clips and restarts; never invent a quota reset time. */
export function chooseBrowserAccount(base: string, ready: number[], selected: number): number {
  const state = read(), entry = state[base] ?? { exhausted: [] }
  const candidates = [...new Set(ready)].sort((a, b) => a - b)
  const id = selected ? candidates.find(id => id === selected) : candidates.find(id => id === entry.current && !entry.exhausted.includes(id)) ?? candidates.find(id => !entry.exhausted.includes(id))
  if (!id) throw new Error(candidates.length && !selected ? 'Kuota semua akun Flow yang siap sudah habis. Setelah kuota tersedia lagi, pilih akun secara manual dan coba satu gambar untuk memeriksanya.' : 'Belum ada worker Chrome yang siap untuk akun Flow. Buka satu proyek Flow pada profil Chrome akun yang dipasangkan.')
  if (entry.current !== id) { entry.current = id; state[base] = entry; save(state) }
  return id
}
export function recordBrowserQuota(base: string, id: number): void {
  const state = read(), entry = state[base] ?? { exhausted: [] }
  entry.exhausted = [...new Set([...entry.exhausted, id])]
  state[base] = entry
  save(state)
}
export function recordBrowserSuccess(base: string, id: number): void {
  const state = read(), entry = state[base]
  if (entry?.exhausted.includes(id)) { entry.exhausted = entry.exhausted.filter(value => value !== id); save(state) }
}
/** Mark account as temporarily unavailable after a non-quota failure (busy/uncertain/timeout).
 *  Auto-clears after 5 minutes so the account can be retried without manual intervention. */
export function recordBrowserTransient(base: string, id: number): void {
  const state = read(), entry = state[base] ?? { exhausted: [], transientUntil: {} }
  entry.exhausted = [...new Set([...entry.exhausted, id])]
  entry.transientUntil = entry.transientUntil || {}
  entry.transientUntil[id] = Date.now() + 5 * 60 * 1000
  state[base] = entry
  save(state)
}
/** Sweep expired transient marks so accounts recover automatically. */
export function sweepTransient(base: string): void {
  const state = read(), entry = state[base]
  if (!entry?.transientUntil) return
  const now = Date.now()
  let changed = false
  for (const [id, until] of Object.entries(entry.transientUntil)) {
    if (now >= until) {
      entry.exhausted = entry.exhausted.filter(v => v !== Number(id))
      delete entry.transientUntil[Number(id)]
      changed = true
    }
  }
  if (changed) save(state)
}
