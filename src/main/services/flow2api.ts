import { flowReadiness } from '../../shared/flowReadiness'
import type { BatchImageRequest, BatchImageResult } from '../flowImageBatch'
import { app } from 'electron'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, extname } from 'node:path'
import { browserJson } from './flowBrowserHttp'
import { browserQuotaAccounts, chooseBrowserAccount, recordBrowserQuota, recordBrowserSuccess, sweepTransient } from './flowAccountRouter'
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
async function selectReadyBrowserAccount(candidates:number[], accounts:FlowSetup['accounts'], signal?:AbortSignal):Promise<number> {
  const settings=getSettings(),base=flowBase(settings.flowBaseUrl),remaining=[...candidates],issues:string[]=[]
  while(remaining.length){
    signal?.throwIfAborted()
    const id=chooseBrowserAccount(base,remaining,settings.flowBrowserAccountId)
    const account=accounts.find(a=>a.id===id)!,label=account.email||`Akun ${id}`
    try{
      const result=flowReadiness(await inspectFlowBrowser(id))
      if(result.state==='ready')return id
      if(result.state==='blocked'){
        pauseFlow(generationGuardBase(),'unusual_activity')
        throw Object.assign(new Error(`${label}: ${result.detail}`),{flowCode:'unusual_activity'})
      }
      throw Object.assign(new Error(`${result.label}. ${result.detail}`),{flowPreflight:true})
    }catch(error){
      if(!(error&&typeof error==='object'&&'flowPreflight' in error))throw error
      const message=`${label}: ${error instanceof Error?error.message:'Halaman belum siap.'}`
      if(settings.flowBrowserAccountId)throw new Error(message)
      issues.push(message);remaining.splice(remaining.indexOf(id),1)
    }
  }
  throw new Error('Belum ada akun Flow dengan halaman siap. '+issues.join(' '))
}
async function browserAccount(signal?:AbortSignal): Promise<number> {
  const base = flowBase(getSettings().flowBaseUrl)
  sweepTransient(base)
  const setup = await flowSetup()
  return selectReadyBrowserAccount(setup.accounts.filter(a=>a.active&&a.workerConnected&&a.imageEnabled).map(a=>a.id),setup.accounts,signal)
}
async function generateBrowserImage(kind: 'image'|'video', prompt: string, aspect: AspectRatio, references: Buffer[], signal: AbortSignal, pinnedAccount?: number): Promise<Buffer> {
  if (!['16:9','9:16'].includes(aspect) || references.length > 3 || (kind === 'video' && references.length !== 1)) throw new Error('Flow memerlukan rasio 16:9/9:16, maksimal tiga referensi gambar, atau tepat satu gambar awal untuk video.')
  const base = flowBase(getSettings().flowBaseUrl), key = requireSecret('flow2api'), guard = generationGuardBase()
  assertFlowNotPaused(guard)
  if ((references.length || kind === 'video') && (await flowSetup()).browserMediaVersion !== 2) throw new Error('Server Flow masih versi lama. Mulai ulang server Flow2API agar referensi karakter dan video terbaca. Permintaan belum dikirim.')
  if (kind === 'video' && getSettings().flowVideoInputMode === 'frames' && (await flowSetup()).browserFramesVersion !== 1) throw new Error('Mulai ulang server Flow2API untuk mengaktifkan mode Frames. Video belum dikirim.')
  let accountId = pinnedAccount ? await selectReadyBrowserAccount([pinnedAccount], (await flowSetup()).accounts, signal) : await browserAccount(signal)
  const automatic = !pinnedAccount && !getSettings().flowBrowserAccountId
  const trial = claimFlowAttempt(guard)
  let sent = false
  try {
    const attempted = new Set<number>()
    for (;;) {
      signal.throwIfAborted()
      if (!trial) assertFlowNotPaused(guard)
      if (attempted.has(accountId)) throw new Error('Tidak ada akun Flow berikutnya yang siap.')
      attempted.add(accountId)
      sent = true
      const started = Date.now()
      const response = await browserJson(base + '/api/kisara/browser/image', key,
        { account_id: accountId, prompt, aspect, kind, video_input_mode: getSettings().flowVideoInputMode, references: references.map(b => 'data:image/' + (b[0]===0xff?'jpeg':b.toString('ascii',0,4)==='RIFF'?'webp':'png') + ';base64,' + b.toString('base64')) }, timeout(signal, kind === 'video' ? 735000 : 405000))
      const value = await response.json() as { mediaUrl?: string; detail?: string; downloadFile?: { path: string; size: number } }
      if (!response.ok) {
        const code = value.detail
        if (code === 'quota_exhausted') {
          sent = false
          recordBrowserQuota(base, accountId)
          if (trial) throw new Error('Kuota akun Flow habis. Percobaan setelah jeda berakhir; periksa akun di Pengaturan sebelum melanjutkan.')
          if (!automatic) throw new Error('Kuota akun Flow habis. Pilih Otomatis untuk memakai akun berikutnya; hasil yang sudah jadi tetap tersimpan.')
          accountId = await browserAccount(signal)
          continue
        }
        if (code === 'google_blocked') throw new Error('Google menolak generasi pada halaman Flow. Proses dijeda; periksa langsung di Chrome sebelum mencoba lagi.')
        const messages: Record<string, string> = {
                  frames_mode_unavailable: 'Mode Frames belum terbuka di Flow. Buka prompt standar, pilih Video → Frames. Video belum dikirim.',
                  frames_settings_unverified: 'Rasio atau jumlah output mode Frames belum dapat dipastikan. Video belum dikirim.',
                  start_frame_unverified: 'Gambar adegan belum terverifikasi sebagai frame awal. Video belum dikirim.',
                  reference_upload_failed: 'Referensi di Flow belum dapat dipasang atau diverifikasi. Generate belum ditekan. Muat ulang worker 1.6.2, lalu periksa lampiran di proyek Flow yang aktif.',
                  existing_attachments: 'Kotak prompt Flow masih berisi lampiran lain. Hapus lampiran lama sebelum mencoba lagi.',
                  video_model_not_verified: 'Pilih model video di pengaturan Flow, lalu coba lagi.',
                  native_input_unavailable: 'Klik Chrome belum tersedia. Muat ulang Flow2API Captcha Worker versi 1.3.0 dan setujui izin debugger bila Chrome memintanya. Tutup DevTools pada tab Flow; permintaan belum dikirim.',
                  submit_unconfirmed: 'Tombol kirim Flow sudah diklik, tetapi halaman belum mengonfirmasi pengiriman. Jangan kirim ulang dulu; periksa draft dan proses di Chrome.',
                  pending_timeout: 'Flow masih menunjukkan proses berjalan setelah batas tunggu. Tunggu hasil di Chrome; permintaan tidak diulang.',
                  result_timeout: 'Flow belum menampilkan gambar baru sampai batas tunggu. Periksa hasil di Chrome sebelum mengulang.',
                  media_download_failed: `${kind === 'video' ? 'Video' : 'Gambar'} sudah muncul di Flow, tetapi belum berhasil diunduh ke Kisara. Jangan buat ulang; periksa hasil di Chrome.`,
                  multiple_outputs: `Flow menampilkan lebih dari satu hasil ${kind === 'video' ? 'video' : 'gambar'} baru. Kisara belum dapat memastikan hasil adegan ini; periksa di Chrome sebelum mengulang.`,
                  unsupported_input: 'Rasio atau panjang prompt Flow tidak didukung. Permintaan belum dikirim.',
                  prompt_not_found: 'Kotak prompt Flow belum ditemukan. Buka proyek Flow yang memiliki kotak prompt.',
                  settings_not_unique: 'Panel pengaturan Flow belum dapat dipastikan. Tutup menu lain di proyek Flow.',
                  prompt_input_failed: 'Prompt belum berhasil dimasukkan ke halaman Flow. Permintaan belum dikirim.',
                  submit_not_ready: 'Tombol mulai Flow belum siap setelah prompt diisi. Periksa kotak prompt di Chrome; permintaan belum dikirim.',
                  existing_draft: 'Kotak prompt Flow masih berisi teks. Simpan atau kosongkan sendiri di Chrome sebelum mencoba lagi.',
                  browser_busy: 'Proyek Flow masih mengerjakan generasi lain. Tunggu hasilnya di Chrome.',
                  approval_required: 'Flow meminta persetujuan biaya di Chrome. Kisara tidak menyetujuinya otomatis. Periksa hasil sebelum mengulang.',
                  image_model_not_verified: 'Kisara belum berhasil memilih Nano Banana 2.1 di Flow. Permintaan belum dikirim; muat ulang Worker 1.5.2.',
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
      if (!value.downloadFile && typeof value.mediaUrl !== 'string') throw new Error('Flow tidak mengembalikan media yang valid.')
      if (value.downloadFile && kind !== 'video') throw new Error('Flow mengembalikan jenis media yang salah.')
      const result = value.downloadFile ? browserDownloadedFile(value.downloadFile, started) : await media(base, key, value.mediaUrl!, timeout(signal, 60000), kind)
      recordBrowserSuccess(base, accountId)
      if (trial) finishFlowAttempt(guard, true)
      return result
    }
  } catch (error) {
    if (sent) pauseFlow(guard, error instanceof Error && error.message.startsWith('Google menolak') ? 'unusual_activity' : 'uncertain_result')
    throw error
  } finally { if (trial) finishFlowAttempt(guard, false) }
}

function browserDownloadedFile(value: { path: string; size: number }, started: number): Buffer {
  const file = realpathSync(value.path), root = realpathSync(app.getPath('downloads')), rel = relative(root, file), stat = statSync(file)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || extname(file).toLowerCase() !== '.mp4' || !stat.isFile() || stat.size !== value.size || stat.size <= 0 || stat.size > 40 * 1024 * 1024 || stat.mtimeMs < started - 5000) throw new Error('Unduhan Flow belum terverifikasi di folder Downloads. Pakai Impor video untuk folder unduhan khusus.')
  return readFileSync(file)
}

/** Recover only the video explicitly opened in Chrome; this endpoint never clicks Generate. */
export async function recoverVideo(signal: AbortSignal): Promise<Buffer> {
  const settings = getSettings(), base = flowBase(settings.flowBaseUrl), key = requireSecret('flow2api')
  if (settings.flowImageTransport !== 'browser') throw new Error('Pengambilan ini memerlukan Flow melalui Chrome.')
  const setup = await flowSetup(), accounts = setup.accounts.filter(a => a.workerConnected && a.imageEnabled)
  const accountId = settings.flowBrowserAccountId || (accounts.length === 1 ? accounts[0].id : 0)
  if (!accountId) throw new Error('Pilih akun Flow yang videonya ingin diambil di Pengaturan Google Flow.')
  const started = Date.now()
  const response = await browserJson(base + '/api/kisara/browser/image', key, { account_id: accountId, kind: 'video', recover: true, selected: true, prompt: 'Recover the video explicitly opened by the user.' }, timeout(signal, 735000))
  const value = await response.json() as { mediaUrl?: string; detail?: string; downloadFile?: { path: string; size: number } }
  if (response.ok && value.downloadFile) return browserDownloadedFile(value.downloadFile, started)
  if (!response.ok || !value.mediaUrl) throw new Error(value.detail === 'browser_busy_or_uncertain' ? 'Pengambilan sebelumnya masih berjalan. Tunggu sampai selesai.' : 'Buka video yang sesuai di Flow sampai pemutarnya terlihat, lalu ambil lagi. Tidak ada generasi baru yang dikirim.')
  return media(base, key, value.mediaUrl, timeout(signal, 60000), 'video')
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
  const exhausted=browserQuotaAccounts(base)
  return { ...data, accounts:data.accounts.map(a=>({...a,quotaExhausted:exhausted.includes(a.id)})), generationPause: flowPause(generationGuardBase()) }
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
  if (!response.ok) {
    if(response.status===401||response.status===403)throw safeFailure('',response.status)
    const detail=(await response.json().catch(()=>({}))) as {detail?:string}
    if(detail.detail==='google_blocked')return {host:'flow.google.com',projectOpen:true,blocked:true,fields:[],buttons:[],options:[]}
    if(response.status===409||response.status===504)throw Object.assign(new Error(response.status===504?'Worker belum merespons pemeriksaan halaman. Periksa Chrome lalu perbarui kesiapan.':'Worker tersambung, tetapi satu proyek Flow belum dapat dibaca. Sisakan tepat satu tab proyek pada profil akun ini.'),{flowPreflight:true})
    throw new Error('Server Flow gagal memeriksa halaman. Periksa koneksi server lokal.')
  }
  const value = await response.json() as FlowBrowserInspection
  if (value.host !== 'flow.google.com' || typeof value.projectOpen !== 'boolean' || typeof value.blocked !== 'boolean' || !Array.isArray(value.fields) || !Array.isArray(value.buttons) || !Array.isArray(value.options)) throw new Error('Respons pemeriksaan browser Flow tidak valid.')
  return value
}

/** One account owns a whole group. Only explicit quota refusal with zero submitted jobs may move it. */
export async function generateImageBatch(requests:BatchImageRequest[],signal:AbortSignal,usedAccounts:number[]):Promise<BatchImageResult[]> {
  const settings=getSettings(),base=flowBase(settings.flowBaseUrl),guard=generationGuardBase()
  if(!requests.length||requests.length>10||new Set(requests.map(r=>r.id)).size!==requests.length)throw new Error('Kelompok gambar harus berisi 1-10 klip unik.')
  assertFlowNotPaused(guard)
  if(flowPause(guard))throw new Error('Uji satu gambar biasa dulu untuk menyelesaikan jeda Flow sebelum menjalankan mode 10 gambar.')
  const setup=await flowSetup()
  if(setup.browserBatchVersion!==1)throw new Error('Mulai ulang server Flow2API untuk memakai mode 10 gambar.')
  const ready=setup.accounts.filter(a=>a.active&&a.workerConnected&&a.imageEnabled&&!usedAccounts.includes(a.id)).map(a=>a.id)
  if(!ready.length)throw new Error('Semua akun siap sudah mendapat jatah maksimal 10 gambar pada putaran ini. Hasil tersimpan; lanjutkan sisanya pada putaran berikutnya.')
  const key=requireSecret('flow2api')
  for(;;){
    signal.throwIfAborted()
    const accountId=await selectReadyBrowserAccount(ready,setup.accounts,signal)
    usedAccounts.push(accountId)
    let sent=false
    try{
      sent=true
      const response=await browserJson(base+'/api/kisara/browser/image-batch',key,{account_id:accountId,tasks:requests.map(r=>({id:r.id,prompt:r.prompt,aspect:r.aspect,references:r.references.map(bytes=>'data:image/'+(bytes[0]===0xff?'jpeg':bytes.toString('ascii',0,4)==='RIFF'?'webp':'png')+';base64,'+bytes.toString('base64'))}))},timeout(signal,615000))
      const body=await response.json() as {detail?:string;results?:{id:string;mediaUrl?:string;error?:string;submitted?:boolean}[]}
      if(!response.ok){
        if(['batch_worker_outdated','browser_not_ready','browser_not_unique','browser_busy_or_uncertain'].includes(body.detail||''))sent=false
        throw new Error(body.detail==='batch_worker_outdated'?'Muat ulang Worker 1.6.0 di profil Chrome akun ini. Belum ada gambar yang dikirim.':'Batch Flow belum dapat dijalankan. Periksa worker dan hasil di Chrome sebelum mencoba lagi.')
      }
      const rows=body.results
      if(!Array.isArray(rows)||rows.length!==requests.length||new Set(rows.map(r=>r.id)).size!==requests.length||rows.some(r=>!requests.some(q=>q.id===r.id)||!!r.mediaUrl===!!r.error))throw new Error('Pemetaan hasil Flow belum dapat dipastikan; permintaan tidak diulang.')
      const rejected=rows.every(r=>!r.submitted&&!r.mediaUrl)
      if(rejected&&rows.some(r=>r.error==='quota_exhausted')&&!rows.some(r=>r.error==='google_blocked')){
        sent=false;recordBrowserQuota(base,accountId)
        if(settings.flowBrowserAccountId)throw new Error('Kuota akun habis. Pilih Otomatis untuk memakai akun berikutnya.')
        const i=ready.indexOf(accountId);if(i>=0)ready.splice(i,1)
        continue
      }
      if(rows.some(r=>r.error==='google_blocked'))pauseFlow(guard,'unusual_activity')
      else if(rows.some(r=>r.error&&r.submitted))pauseFlow(guard,'uncertain_result')
      const results:BatchImageResult[]=[]
      for(const row of rows){
        if(row.error){results.push({id:row.id,...(row.error==='batch_stopped'?{skipped:true}:{}),error:row.error==='google_blocked'?'Google menolak aktivitas di Flow. Antrean dijeda; akun tidak diganti.':row.error==='batch_stopped'?'Belum dikirim karena kelompok dihentikan.':row.error==='reference_upload_failed'&&row.submitted===false?'Referensi di Flow belum dapat dipasang atau diverifikasi. Generate belum ditekan; batch dihentikan. Muat ulang worker 1.6.2, lalu periksa lampiran. Gambar yang sudah berhasil tetap tersimpan.':'Batch Flow berhenti: '+row.error+'. Periksa hasil di Chrome; permintaan tidak diulang.'});continue}
        try{results.push({id:row.id,bytes:await media(base,key,row.mediaUrl!,timeout(signal,60000),'image')})}
        catch{pauseFlow(guard,'uncertain_result');results.push({id:row.id,error:'Hasil sudah dibuat tetapi belum diunduh. Periksa Flow; jangan buat ulang.'})}
      }
      if(results.every(r=>r.bytes))recordBrowserSuccess(base,accountId)
      return results
    }catch(error){if(sent)pauseFlow(guard,'uncertain_result');throw error}
  }
}

/** Parallelism is only across independent workers; manual account selection remains serial. */
export async function parallelVideoAccounts(): Promise<number[]> {
  const settings = getSettings()
  if (settings.flowImageTransport !== 'browser' || settings.flowBrowserAccountId) return []
  assertFlowNotPaused(generationGuardBase())
  if (flowPause(generationGuardBase())) return []
  const setup = await flowSetup()
  const candidates = setup.accounts.filter(a => a.active && a.workerConnected && a.imageEnabled && !a.browserBusy && !a.uncertainResult && !a.quotaExhausted && a.routeKey && setup.accounts.filter(b => b.routeKey === a.routeKey).length === 1)
  if (setup.browserParallelVersion !== 1) {
    if (candidates.length < 2) return []
    throw new Error('Mulai ulang server Flow2API untuk mengaktifkan video paralel antar akun. Video belum dikirim.')
  }
  const ready: number[] = []
  for (const account of candidates) {
    let inspection: FlowBrowserInspection
    try { inspection = await inspectFlowBrowser(account.id) }
    catch (error) { if (error && typeof error === 'object' && 'flowPreflight' in error) continue; throw error }
    const state = flowReadiness(inspection)
    if (state.state === 'blocked') { pauseFlow(generationGuardBase(), 'unusual_activity'); throw new Error('Google menolak aktivitas pada akun Flow. Generasi dijeda; periksa di Chrome.') }
    if (state.state === 'ready') ready.push(account.id)
    if (ready.length === 3) break
  }
  if (!ready.length) throw new Error('Belum ada akun video Flow yang siap. Periksa Chrome dan hasil sebelumnya; video belum dikirim.')
  return ready
}
export async function generateAccountVideo(account: number, prompt: string, aspect: AspectRatio, references: Buffer[], signal: AbortSignal): Promise<Buffer> {
  return generateBrowserImage('video', prompt, aspect, references, signal, account)
}
