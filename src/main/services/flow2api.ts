import { chooseBrowserAccount, recordBrowserQuota, recordBrowserSuccess, sweepTransient } from './flowAccountRouter'
import { assertFlowNotPaused, claimFlowAttempt, finishFlowAttempt, flowPause, pauseFlow, resumeFlow } from './flowGuard'
import type { FlowBrowserInspection, FlowSetup } from '@shared/production'
import type { AspectRatio, KeyTestResult } from '@shared/types'
import { getSettings } from '../settings'
import { requireSecret } from '../secrets'

export interface FlowStatus extends KeyTestResult { models: string[]; activeAccounts: number; failover: boolean; setupAvailable?: boolean }
export function flowBase(value: string): string {
  const u = new URL(value.trim())
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !['', '/'].includes(u.pathname)) throw new Error('Flow2API harus memakai alamat server lokal, contoh http://127.0.0.1:8765.')
  return u.origin
}
const timeout = (signal?: AbortSignal, ms = 15000): AbortSignal => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)
export function quotaError(text: string): boolean {
  if (/captcha|recaptcha|unauthorized|authentication|PUBLIC_ERROR_UNUSUAL_ACTIVITY|unusual.activity/i.test(text)) return false
  return /quota.{0,60}(?:exceed|exhaust|limit)|(?:insufficient|not enough).{0,30}credits?|daily.{0,20}limit|额度.{0,15}(?:不足|耗尽|用完)/i.test(text)
}
function safeFailure(text: string, status = 0): Error {
  if (/PUBLIC_ERROR_UNUSUAL_ACTIVITY|unusual.activity/i.test(text)) return Object.assign(new Error('Google Flow menolak permintaan karena aktivitas tidak biasa (PUBLIC_ERROR_UNUSUAL_ACTIVITY). Generasi dijeda; periksa Flow langsung, lalu izinkan satu percobaan dari Pengaturan. Akun tidak diganti otomatis.'), { flowCode: 'unusual_activity' })
  if (/captcha|recaptcha/i.test(text)) return new Error('Worker CAPTCHA Flow belum siap atau gagal. Periksa profil Chrome dan Route Key akun; akun tidak diganti otomatis.')
  if (quotaError(text)) return new Error('Kuota akun Flow habis. Akun berikutnya belum tersedia atau backend perlu diperbarui; gambar yang sudah jadi tetap tersimpan.')
  if (status === 401 || status === 403) return new Error('API key Flow2API ditolak. Hubungkan ulang server lokal di Pengaturan.')
  if (/no available|没有可用|no active|未连接|路由|无可用/i.test(text)) return new Error('Tidak ada akun atau worker Flow yang siap. Periksa akun aktif dan Route Key di panel Flow2API.')
  return new Error(status ? `Flow2API gagal memproses permintaan (HTTP ${status}). Periksa panel dan log server lokal.` : 'Flow2API belum mengembalikan media yang valid. Periksa panel server; permintaan tidak diulang otomatis.')
}
export async function status(baseUrl = getSettings().flowBaseUrl, key = requireSecret('flow2api')): Promise<FlowStatus> {
  const base = flowBase(baseUrl), signal = timeout()
  const [h, m] = await Promise.all([fetch(base + '/health', { signal }), fetch(base + '/v1/models', { signal, headers: { Authorization: `Bearer ${key}` } })])
  if (!h.ok || !m.ok) throw safeFailure('', m.ok ? h.status : m.status)
  const health = await h.json() as { active_tokens?: number; kisara_failover?: boolean; kisara_setup?: boolean }
  const catalog = await m.json() as { data?: { id?: string }[] }
  const models = (catalog.data ?? []).map(m => m.id).filter((v): v is string => typeof v === 'string' && /^[a-zA-Z0-9_.:/-]{1,180}$/.test(v))
  if (!models.length) throw new Error('Server Flow2API tidak memberikan daftar model.')
  const activeAccounts = Number(health.active_tokens) || 0
  return { ok: true, models, activeAccounts, setupAvailable: health.kisara_setup === true, failover: health.kisara_failover === true, message: `Server terhubung · ${activeAccounts} akun aktif. Generasi dan worker belum diuji.` }
}

/** Stream errors may arrive with HTTP 200; never confuse running commentary with a media result. */
export function completionText(body: string): string {
  const fragments: string[] = []; let error = ''
  const consume = (v: unknown): void => {
    if (!v || typeof v !== 'object') return
    const d = v as { error?: unknown; choices?: { delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: string }[] }
    if (d.error) error = typeof d.error === 'string' ? d.error : JSON.stringify(d.error)
    for (const c of d.choices ?? []) {
      const content = c.delta?.content ?? c.message?.content
      if (typeof content === 'string') fragments.push(content)
      else if (Array.isArray(content)) for (const part of content) if (part && typeof part.text === 'string') fragments.push(part.text)
      if (c.finish_reason === 'error') error ||= 'Generation failed'
    }
  }
  const trimmed = body.trim()
  if (trimmed.startsWith('{')) { try { consume(JSON.parse(trimmed)) } catch { throw safeFailure('') } }
  else for (const line of body.split(/\r?\n/)) if (line.startsWith('data:')) {
    const data = line.slice(5).trim(); if (data && data !== '[DONE]') { try { consume(JSON.parse(data)) } catch { /* Ignore a non-JSON heartbeat, never media. */ } }
  }
  if (error) throw Object.assign(safeFailure(error), { quota: quotaError(error) })
  const text = fragments.join('')
  if (!text) throw safeFailure('')
  return text
}
export function mediaTarget(text: string): string {
  const data = text.match(/data:(?:image|video)\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+/)
  if (data) return data[0]
  const markdown = text.match(/!?\[[^\]]*\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/)
  if (markdown) return markdown[1]
  if (/^(https?:\/\/\S+|\/(?:files|static|output|v1)\/\S+)$/.test(text.trim())) return text.trim()
  throw safeFailure(text)
}
async function bytes(response: Response, max: number): Promise<Buffer> {
  if (!response.body) throw safeFailure('')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new Error('Hasil Flow terlalu besar untuk diproses.'); chunks.push(value) } }
  finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
async function media(base: string, key: string, target: string, signal: AbortSignal, kind: 'image'|'video'): Promise<Buffer> {
  const max = kind === 'image' ? 40 * 1024 * 1024 : 300 * 1024 * 1024
  if (target.startsWith('data:')) {
    if (target.length > max * 1.4 || !target.startsWith(`data:${kind}/`)) throw safeFailure('')
    const data = Buffer.from(target.slice(target.indexOf(',') + 1).replace(/\s/g, ''), 'base64'); if (!data.length || data.length > max) throw safeFailure(''); return data
  }
  let url = new URL(target, base)
  for (let hop = 0; hop < 4; hop++) {
    const local = url.origin === base
    if (!local && (url.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|\[)/i.test(url.hostname))) throw new Error('Alamat media Flow tidak didukung.')
    const response = await fetch(url, { signal, redirect: 'manual', headers: local ? { Authorization: `Bearer ${key}` } : {} })
    if ([301,302,303,307,308].includes(response.status)) { const next = response.headers.get('location'); if (!next) throw safeFailure(''); url = new URL(next, url); continue }
    if (!response.ok) throw safeFailure('', response.status)
    return bytes(response, max)
  }
  throw new Error('Terlalu banyak pengalihan alamat media Flow.')
}
export function modelForAspect(model: string, aspect: AspectRatio): string {
  const direction = aspect === '9:16' ? 'portrait' : 'landscape'
  return model.replace(/-(landscape|portrait|square|four-three|three-four)(?=-|$)/, '-' + direction)
}
function assertWorkerReady(setup: FlowSetup, kind: 'image'|'video'): void {
  if (!setup.extensionMode) return
  const connected = setup.accounts.filter(a => a.workerConnected)
  if (connected.some(a => a.active && (kind === 'video' || a.imageEnabled))) return
  if (connected.some(a => !a.active)) throw new Error('Worker Chrome tersambung, tetapi akun yang dipasangkan nonaktif di Flow2API. Buka panel akun dan periksa status serta log akun tersebut. Tidak ada permintaan yang dikirim; Generasi belum dimulai.')
  if (kind === 'image' && connected.some(a => a.active && !a.imageEnabled)) throw new Error('Worker Chrome tersambung, tetapi pembuatan gambar untuk akun ini dinonaktifkan di Flow2API. Periksa izin gambar di panel akun. Generasi belum dimulai.')
  throw new Error('Belum ada worker Chrome tersambung untuk akun Flow yang siap. Buka profil Chrome akun yang dipasangkan, lalu periksa koneksi Worker di Pengaturan. Tidak ada permintaan yang dikirim; Generasi belum dimulai.')
}

function generationGuardBase(): string {
  const s = getSettings(), base = flowBase(s.flowBaseUrl)
  return s.flowImageTransport === 'browser' ? base + '/browser' : base
}
async function browserAccount(): Promise<number> {
  const base = flowBase(getSettings().flowBaseUrl)
  sweepTransient(base)
  const setup = await flowSetup(), selected = getSettings().flowBrowserAccountId
  return chooseBrowserAccount(base, setup.accounts.filter(a => a.workerConnected && a.imageEnabled).map(a => a.id), selected)
}
async function generateBrowserImage(kind: 'image'|'video', prompt: string, aspect: AspectRatio, references: Buffer[], signal: AbortSignal): Promise<Buffer> {
  if (!['16:9','9:16'].includes(aspect) || references.length > 3 || (kind === 'video' && references.length !== 1)) throw new Error('Flow memerlukan rasio 16:9/9:16, maksimal tiga referensi gambar, atau tepat satu gambar awal untuk video.')
  const base = flowBase(getSettings().flowBaseUrl), key = requireSecret('flow2api'), guard = generationGuardBase()
  assertFlowNotPaused(guard)
  if ((references.length || kind === 'video') && (await flowSetup()).browserMediaVersion !== 2) throw new Error('Server Flow masih versi lama. Mulai ulang server Flow2API agar referensi karakter dan video terbaca. Permintaan belum dikirim.')
  if (kind === 'video' && getSettings().flowVideoInputMode === 'frames' && (await flowSetup()).browserFramesVersion !== 1) throw new Error('Mulai ulang server Flow2API untuk mengaktifkan mode Frames. Video belum dikirim.')
  let accountId = await browserAccount()
  const automatic = !getSettings().flowBrowserAccountId
  const trial = claimFlowAttempt(guard)
  let sent = false
  try {
    const attempted = new Set<number>()
    for (;;) {
      signal.throwIfAborted()
      if (attempted.has(accountId)) throw new Error('Tidak ada akun Flow berikutnya yang siap.')
      attempted.add(accountId)
      sent = true
      const response = await fetch(base + '/api/kisara/browser/image', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, prompt, aspect, kind, video_input_mode: getSettings().flowVideoInputMode, references: references.map(b => 'data:image/' + (b[0]===0xff?'jpeg':b.toString('ascii',0,4)==='RIFF'?'webp':'png') + ';base64,' + b.toString('base64')) }), signal: timeout(signal, kind === 'video' ? 735000 : 405000)
      })
      const value = await response.json() as { mediaUrl?: string; detail?: string }
      if (!response.ok) {
        const code = value.detail
        if (code === 'quota_exhausted') {
          sent = false
          recordBrowserQuota(base, accountId)
          if (trial) throw new Error('Kuota akun Flow habis. Percobaan setelah jeda berakhir; periksa akun di Pengaturan sebelum melanjutkan.')
          if (!automatic) throw new Error('Kuota akun Flow habis. Pilih Otomatis untuk memakai akun berikutnya; hasil yang sudah jadi tetap tersimpan.')
          accountId = await browserAccount()
          continue
        }
        if (code === 'google_blocked') throw new Error('Google menolak generasi pada halaman Flow. Proses dijeda; periksa langsung di Chrome sebelum mencoba lagi.')
        const messages: Record<string, string> = {
                  frames_mode_unavailable: 'Mode Frames belum terbuka di Flow. Buka prompt standar, pilih Video → Frames. Video belum dikirim.',
                  frames_settings_unverified: 'Rasio atau jumlah output mode Frames belum dapat dipastikan. Video belum dikirim.',
                  start_frame_unverified: 'Gambar adegan belum terverifikasi sebagai frame awal. Video belum dikirim.',
                  reference_upload_failed: 'Gambar referensi belum selesai terpasang di Flow. Permintaan belum dikirim. Periksa lampiran di proyek Flow yang aktif.',
                  existing_attachments: 'Kotak prompt Flow masih berisi lampiran lain. Hapus lampiran lama sebelum mencoba lagi.',
                  video_model_not_verified: 'Pilih model video di pengaturan Flow, lalu coba lagi.',
                  native_input_unavailable: 'Klik Chrome belum tersedia. Muat ulang Flow2API Captcha Worker versi 1.3.0 dan setujui izin debugger bila Chrome memintanya. Tutup DevTools pada tab Flow; permintaan belum dikirim.',
                  submit_unconfirmed: 'Tombol kirim Flow sudah diklik, tetapi halaman belum mengonfirmasi pengiriman. Jangan kirim ulang dulu; periksa draft dan proses di Chrome.',
                  pending_timeout: 'Flow masih menunjukkan proses berjalan setelah batas tunggu. Tunggu hasil di Chrome; permintaan tidak diulang.',
                  result_timeout: 'Flow belum menampilkan gambar baru sampai batas tunggu. Periksa hasil di Chrome sebelum mengulang.',
                  media_download_failed: 'Gambar sudah muncul di Flow, tetapi belum berhasil diunduh ke Kisara. Jangan buat ulang; periksa hasil di Chrome.',
                  multiple_outputs: 'Flow menampilkan lebih dari satu gambar baru. Kisara belum dapat memilih hasil yang sesuai; periksa di Chrome sebelum mengulang.',
                  unsupported_input: 'Rasio atau panjang prompt Flow tidak didukung. Permintaan belum dikirim.',
                  prompt_not_found: 'Kotak prompt Flow belum ditemukan. Buka proyek Flow yang memiliki kotak prompt.',
                  settings_not_unique: 'Panel pengaturan Flow belum dapat dipastikan. Tutup menu lain di proyek Flow.',
                  prompt_input_failed: 'Prompt belum berhasil dimasukkan ke halaman Flow. Permintaan belum dikirim.',
                  submit_not_ready: 'Tombol mulai Flow belum siap setelah prompt diisi. Periksa kotak prompt di Chrome; permintaan belum dikirim.',
                  existing_draft: 'Kotak prompt Flow masih berisi teks. Simpan atau kosongkan sendiri di Chrome sebelum mencoba lagi.',
                  browser_busy: 'Proyek Flow masih mengerjakan generasi lain. Tunggu hasilnya di Chrome.',
                  approval_required: 'Flow meminta persetujuan biaya di Chrome. Kisara tidak menyetujuinya otomatis. Periksa hasil sebelum mengulang.',
                  image_model_not_verified: 'Pilih Nano Banana 2.1 pada pengaturan gambar Flow di Chrome.',
                  image_settings_not_unique: 'Kontrol gambar Flow berubah. Permintaan tidak dikirim; perlu pemeriksaan penghubung.',
                  browser_not_ready: 'Buka tepat satu proyek Flow di profil Chrome akun yang dipilih.',
                  browser_not_unique: 'Route Key dipakai lebih dari satu worker. Sisakan satu worker untuk akun ini.',
                  browser_busy_or_uncertain: 'Hasil permintaan sebelumnya belum dipastikan. Periksa proyek Flow; permintaan tidak diulang otomatis.'
                }
                // Pre-submit refusals are safe to correct; all other failures may already have spent a generation.
                const preSubmitCodes = [
                  'frames_mode_unavailable','frames_settings_unverified','start_frame_unverified','reference_upload_failed','existing_attachments','video_model_not_verified','native_input_unavailable',
                  'prompt_input_failed','submit_not_ready','existing_draft','browser_busy',
                  'image_model_not_verified','image_settings_not_unique','browser_not_ready',
                  'browser_not_unique','prompt_not_found','settings_not_unique','unsupported_input'
                ]
                if (preSubmitCodes.includes(code || '')) sent = false
                // Keep ambiguous paid submissions paused; quota is the only automatic failover proof.
                throw new Error(messages[code || ''] || 'Hasil Flow belum dapat dipastikan. Periksa proyek di Chrome sebelum mencoba lagi; permintaan tidak diulang.')
      }
      if (typeof value.mediaUrl !== 'string') throw new Error('Flow tidak mengembalikan gambar yang valid.')
      const result = await media(base, key, value.mediaUrl, timeout(signal, 60000), kind)
      recordBrowserSuccess(base, accountId)
      if (trial) finishFlowAttempt(guard, true)
      return result
    }
  } catch (error) {
    if (sent) pauseFlow(guard, error instanceof Error && error.message.startsWith('Google menolak') ? 'unusual_activity' : 'uncertain_result')
    throw error
  } finally { if (trial) finishFlowAttempt(guard, false) }
}

export async function generate(kind: 'image'|'video', prompt: string, aspect: AspectRatio, references: Buffer[], signal: AbortSignal): Promise<Buffer> {
  const s = getSettings(), base = flowBase(s.flowBaseUrl), key = requireSecret('flow2api')
  if (s.flowImageTransport === 'browser') {
    return generateBrowserImage(kind, prompt, aspect, references, signal)
  }
  assertFlowNotPaused(base)
  const model = modelForAspect(kind === 'image' ? s.flowImageModel : s.flowVideoModel, aspect)
  const info = await status(base, key)
  if (info.setupAvailable) {
    const setup = await flowSetup()
    assertWorkerReady(setup, kind)
  }
  if (!info.activeAccounts) throw new Error('Belum ada akun Google aktif di Flow2API.')
  if (!info.models.includes(model)) throw new Error('Model Flow yang dipilih tidak tersedia pada server. Pilih model lain di Pengaturan.')
  const content = references.length ? [{ type: 'text', text: prompt }, ...references.slice(0,3).map(data => ({ type:'image_url', image_url:{ url:`data:image/${data[0]===0xff?'jpeg':data.toString('ascii',0,4)==='RIFF'?'webp':'png'};base64,${data.toString('base64')}` } }))] : prompt
  const signalWithTimeout = timeout(signal, kind === 'image' ? 330000 : 660000)
  const trial = claimFlowAttempt(base)
  try {
    // Only a confirmed upstream quota rejection is safe to retry on another account.
    for (let attempt = 0; attempt < Math.min(info.activeAccounts, 10); attempt++) {
      signalWithTimeout.throwIfAborted()
      try {
        const r = await fetch(base + '/v1/chat/completions', { method:'POST', signal:signalWithTimeout, headers:{Authorization:`Bearer ${key}`, 'Content-Type':'application/json'}, body:JSON.stringify({ model, messages:[{role:'user',content}], stream:true }) })
        const body = (await bytes(r, 60 * 1024 * 1024)).toString('utf8')
        if (!r.ok) throw Object.assign(safeFailure(body,r.status), {quota:quotaError(body)})
        const result = await media(base, key, mediaTarget(completionText(body)), signalWithTimeout, kind)
        if (trial) finishFlowAttempt(base, true)
        return result
      } catch (e) {
        if (e && typeof e === 'object' && 'flowCode' in e && e.flowCode === 'unusual_activity') pauseFlow(base)
        signalWithTimeout.throwIfAborted()
        if (!trial && info.failover && e && typeof e === 'object' && 'quota' in e && e.quota && attempt + 1 < Math.min(info.activeAccounts,10)) continue
        if (e instanceof TypeError) throw new Error('Koneksi Flow2API terputus. Periksa server lokal. Permintaan tidak diulang untuk mencegah hasil ganda.')
        throw e
      }
    }
    throw safeFailure('quota exhausted')
  } finally { if (trial) finishFlowAttempt(base, false) }
}

export async function flowSetup(): Promise<FlowSetup> {
  const base = flowBase(getSettings().flowBaseUrl)
  const r = await fetch(base + '/api/kisara/status', { headers: {Authorization: 'Bearer ' + requireSecret('flow2api')}, signal: timeout() })
  if (!r.ok) throw new Error('Pemeriksaan worker belum tersedia. Mulai ulang server Flow2API setelah pembaruan.')
  const data = await r.json() as FlowSetup
  if (!Array.isArray(data.accounts) || !Array.isArray(data.workers) || typeof data.extensionMode !== 'boolean' || data.accounts.length > 200 || data.workers.length > 200 || data.accounts.some(a=>!a || !Number.isInteger(a.id) || typeof a.email!=='string' || typeof a.routeKey!=='string' || typeof a.workerConnected!=='boolean' || typeof a.active!=='boolean' || typeof a.imageEnabled!=='boolean') || data.workers.some(w=>!w || typeof w.routeKey!=='string' || typeof w.label!=='string')) throw safeFailure('')
  return { ...data, generationPause: flowPause(generationGuardBase()) }
}
export async function resumeFlowGeneration(): Promise<FlowSetup> {
  const data = await flowSetup()
  if (getSettings().flowImageTransport === 'browser') {
    const response = await fetch(flowBase(getSettings().flowBaseUrl) + '/api/kisara/browser/acknowledge', { method:'POST', headers:{Authorization:'Bearer '+requireSecret('flow2api'),'Content-Type':'application/json'}, body:JSON.stringify({account_id:await browserAccount()}), signal:timeout() })
    if (!response.ok) throw new Error('Permintaan browser masih berjalan atau statusnya belum dapat dibaca. Periksa Flow sebelum melanjutkan.')
  }
  resumeFlow(generationGuardBase())
  return { ...data, generationPause: flowPause(generationGuardBase()) }
}
export async function pairFlowRoute(accountId: number, routeKey: string): Promise<FlowSetup> {
  if (!Number.isInteger(accountId) || accountId <= 0 || !/^[a-zA-Z0-9_-]{1,64}$/.test(routeKey)) throw new Error('Pilihan akun atau worker tidak valid.')
  const r = await fetch(flowBase(getSettings().flowBaseUrl) + '/api/kisara/route', {method:'POST', headers:{Authorization:'Bearer '+requireSecret('flow2api'),'Content-Type':'application/json'}, body:JSON.stringify({account_id:accountId,route_key:routeKey}), signal:timeout()})
  if (!r.ok) throw new Error(r.status === 409 ? 'Worker belum tersambung atau sudah dipasangkan ke akun lain. Perbarui daftar dan periksa profil Chrome.' : 'Pemasangan akun gagal. Periksa server Flow2API.')
  return flowSetup()
}

/** Fail a bulk action before it creates dozens of jobs that cannot reach a worker. */
export async function assertFlowReady(kind: 'image'|'video'): Promise<void> {
  if (getSettings().flowImageTransport === 'browser') {
    assertFlowNotPaused(generationGuardBase())
    await browserAccount()
    return
  }
  assertFlowNotPaused(flowBase(getSettings().flowBaseUrl))
  const info = await status()
  if (!info.activeAccounts) throw new Error('Belum ada akun Google aktif di Flow2API.')
  if (info.setupAvailable) {
    const setup = await flowSetup()
    assertWorkerReady(setup, kind)
  }
}

/** Inspect normal editor controls without reading credentials or submitting a generation. */
export async function inspectFlowBrowser(accountId: number): Promise<FlowBrowserInspection> {
  if (!Number.isInteger(accountId) || accountId <= 0) throw new Error('Pilih akun Flow yang benar.')
  const response = await fetch(flowBase(getSettings().flowBaseUrl) + '/api/kisara/browser/inspect', {
    method: 'POST', headers: { Authorization: 'Bearer ' + requireSecret('flow2api'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId }), signal: timeout(undefined, 20000)
  })
  if (!response.ok) throw new Error(response.status === 504 ? 'Muat ulang worker versi 1.2.0, lalu buka satu proyek Flow di Chrome.' : 'Halaman belum dapat diperiksa. Buka tepat satu proyek Flow pada profil akun ini dan periksa koneksi worker.')
  const value = await response.json() as FlowBrowserInspection
  if (value.host !== 'flow.google.com' || typeof value.projectOpen !== 'boolean' || typeof value.blocked !== 'boolean' || !Array.isArray(value.fields) || !Array.isArray(value.buttons) || !Array.isArray(value.options)) throw new Error('Respons pemeriksaan browser Flow tidak valid.')
  return value
}
