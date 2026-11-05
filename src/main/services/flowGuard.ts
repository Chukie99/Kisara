import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from '../paths'

export interface FlowPause { code: 'unusual_activity' | 'uncertain_result'; pausedAt: number; retryAllowed?: boolean }
const activeTrials = new Set<string>()
const filename = (): string => join(dataDir(), 'flow-generation-state.json')
function state(): Record<string, FlowPause> {
  try {
    if (!existsSync(filename())) return {}
    const value = JSON.parse(readFileSync(filename(), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    const entries = Object.entries(value).filter(([, p]) => {
      const pause = p as Partial<FlowPause> | null
      return (pause?.code === 'unusual_activity' || pause?.code === 'uncertain_result') && typeof pause.pausedAt === 'number' && Number.isFinite(pause.pausedAt)
    })
    return Object.fromEntries(entries.map(([base, p]) => { const pause = p as FlowPause; return [base, { code: pause.code, pausedAt: pause.pausedAt, retryAllowed: pause.retryAllowed === true }] })) as Record<string, FlowPause>
  } catch { throw new Error('Status jeda Flow tidak dapat dibaca. Periksa folder data Kisara sebelum mencoba lagi.') }
}
function save(value: Record<string, FlowPause>): void {
  mkdirSync(dataDir(), { recursive: true })
  const temporary = filename() + '.tmp'
  writeFileSync(temporary, JSON.stringify(value))
  renameSync(temporary, filename())
}
export function flowPause(base: string): FlowPause | undefined { return state()[base] }
export function pauseFlow(base: string, code: FlowPause['code'] = 'unusual_activity'): void {
  const value = state()
  value[base] = { code, pausedAt: Date.now() }
  save(value)
}
export function resumeFlow(base: string): void {
  if (activeTrials.has(base)) throw new Error('Percobaan Flow masih berjalan. Tunggu sampai selesai.')
  const value = state()
  if (value[base]) { value[base].retryAllowed = true; save(value) }
}
export function claimFlowAttempt(base: string): boolean {
  assertFlowNotPaused(base)
  const value = state()
  if (!value[base]) return false
  value[base].retryAllowed = false
  save(value)
  activeTrials.add(base)
  return true
}
export function finishFlowAttempt(base: string, success: boolean): void {
  if (!activeTrials.delete(base)) return
  if (success) { const value = state(); delete value[base]; save(value) }
}
export function assertFlowNotPaused(base: string): void {
  const pause = flowPause(base)
  if (pause?.code === 'uncertain_result' && !pause.retryAllowed) throw new Error('Hasil generasi Flow sebelumnya belum dipastikan. Periksa proyek di Chrome sebelum mengizinkan percobaan baru di Pengaturan; permintaan tidak diulang otomatis.')
  if (pause && !pause.retryAllowed) throw new Error('Generasi Flow dijeda setelah Google menolak aktivitas tidak biasa. Tidak ada permintaan yang dikirim. Buka Pengaturan → Google Flow, periksa Flow langsung, lalu izinkan satu percobaan lagi.')
}
