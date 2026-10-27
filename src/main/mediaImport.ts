import { execFile } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import type { Asset, Clip } from '@shared/types'
import type { MediaImportPlan, MediaImportChoice } from '@shared/production'
import { matchMediaScene } from '@shared/mediaMatching'
import { getDb } from './db'
import { clipsOf, getProject, insertAsset, patchClip, touchProject } from './repo'
import { assetAbsPath, binPath } from './paths'
import { normalizeGeneratedImage } from './imageQuality'
import { probeDurationMs, probeSize } from './services/audio'
import { emit } from './events'

const imageExtensions = new Set(['.png','.jpg','.jpeg','.webp'])
const videoExtensions = new Set(['.mp4','.mov','.webm','.mkv','.m4v'])
async function normalizeVideo(source: string, target: string, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(binPath(ffmpegStatic!), ['-y','-v','error','-i',source,'-map','0:v:0','-map','0:a?','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',target], { windowsHide: true, timeout: 180000, signal, maxBuffer: 1024 * 1024 }, error => error ? reject(new Error('Video tidak bisa dibaca atau konversinya melewati tiga menit: ' + basename(source))) : resolve())
  })
}

const ttlMs = 15 * 60 * 1000
interface Ticket { projectId: string; fingerprint: string; expires: number; busy: boolean; controller?: AbortController; files: { id: string; path: string; name: string; kind: 'image' | 'video'; size: number; modified: number }[] }
const tickets = new Map<string, Ticket>()
const fingerprint = (clips: Clip[]) => JSON.stringify(clips.map(c => [c.id,c.title,c.narration,c.visualPrompt,c.imageAssetId,c.videoAssetId,c.motionType,c.durationMs]))

/** Paths come only from Electron's file picker; the renderer receives opaque IDs. */
export async function prepareMediaImport(projectId: string, paths: string[]): Promise<MediaImportPlan> {
  getProject(projectId)
  const clips = clipsOf(projectId)
  if (!clips.length) throw new Error('Susun adegan dulu sebelum mengimpor hasil Flow.')
  if (!Array.isArray(paths) || !paths.length || paths.length > 200) throw new Error('Pilih 1–200 gambar atau video per impor.')
  for (const [token,ticket] of tickets) if (!ticket.busy && ticket.expires < Date.now()) tickets.delete(token)
  if (tickets.size >= 10) throw new Error('Tutup pratinjau impor sebelumnya sebelum memilih file lagi.')
  const files: Ticket['files'] = []
  let total = 0
  for (const path of [...new Set(paths)]) {
    const ext = extname(path).toLocaleLowerCase()
    const kind = imageExtensions.has(ext) ? 'image' : videoExtensions.has(ext) ? 'video' : null
    if (!kind) throw new Error('Format tidak didukung: ' + basename(path))
    const info = await stat(path)
    if (!info.isFile() || info.size === 0 || info.size > (kind === 'image' ? 100 : 512) * 1024 * 1024) throw new Error('Ukuran file tidak valid: ' + basename(path))
    total += info.size
    if (total > 2 * 1024 * 1024 * 1024) throw new Error('Total impor melebihi 2 GB. Bagi menjadi beberapa paket.')
    files.push({ id: randomUUID(), path, name: basename(path), kind, size: info.size, modified: info.mtimeMs })
  }
  const token = randomUUID()
  tickets.set(token, { projectId, fingerprint: fingerprint(clips), expires: Date.now() + ttlMs, busy: false, files })
  return { token, projectId, rows: files.map(file => ({ id: file.id, name: file.name, kind: file.kind, suggestedClipId: matchMediaScene(file.name, clips) })) }
}

export function discardMediaImport(token: string): void {
  const ticket = tickets.get(token)
  if (ticket?.busy) ticket.controller?.abort()
  else tickets.delete(token)
}

export async function applyMediaImport(projectId: string, token: string, choices: MediaImportChoice[], replaceExisting: boolean): Promise<{ imported: number; skipped: number }> {
  const ticket = tickets.get(token)
  if (!ticket || ticket.projectId !== projectId || ticket.expires < Date.now()) throw new Error('Pratinjau impor kedaluwarsa. Pilih file lagi.')
  if (ticket.busy) throw new Error('Impor paket ini masih berjalan.')
  getProject(projectId)
  const clips = clipsOf(projectId)
  if (ticket.fingerprint !== fingerprint(clips)) throw new Error('Adegan atau aset berubah setelah file dipilih. Pilih file ulang agar pasangan tetap benar.')
  if (!Array.isArray(choices) || choices.length !== ticket.files.length || new Set(choices.map(c => c.fileId)).size !== choices.length || typeof replaceExisting !== 'boolean') throw new Error('Daftar pasangan impor tidak valid.')
  const selected: { file: Ticket['files'][number]; clip: Clip }[] = []
  const pairs = new Set<string>()
  for (const choice of choices) {
    const file = ticket.files.find(f => f.id === choice.fileId)
    if (!file) throw new Error('File tidak termasuk pilihan awal.')
    if (choice.clipId === null) continue
    const clip = clips.find(c => c.id === choice.clipId)
    if (!clip) throw new Error('Adegan tujuan tidak cocok dengan proyek.')
    const pair = clip.id + ':' + file.kind
    if (pairs.has(pair)) throw new Error('Ada dua ' + (file.kind === 'image' ? 'gambar' : 'video') + ' untuk satu adegan. Pilih satu atau lewati file lainnya.')
    pairs.add(pair)
    const replaces = file.kind === 'video' ? !!clip.videoAssetId : !!(clip.imageAssetId || clip.videoAssetId)
    if (replaces && !replaceExisting) throw new Error('Ada visual lama yang akan diganti. Aktifkan izin mengganti atau lewati adegan tersebut.')
    selected.push({ file, clip })
  }
  if (!selected.length) throw new Error('Pilih paling sedikit satu pasangan file dan adegan.')
  ticket.busy = true
  const controller = new AbortController()
  ticket.controller = controller
  const created: string[] = []
  const staged: { file: Ticket['files'][number]; clip: Clip; localPath: string; width: number; height: number; durationMs?: number }[] = []
  let committed = false
  try {
    for (const { file, clip } of selected) {
      controller.signal.throwIfAborted()
      const before = await stat(file.path)
      if (before.size !== file.size || before.mtimeMs !== file.modified) throw new Error('File berubah setelah dipilih: ' + file.name)
      controller.signal.throwIfAborted()
      const bytes = file.kind === 'image' ? await normalizeGeneratedImage(await readFile(file.path)) : null
      const ext = bytes ? bytes[0] === 0xff && bytes[1] === 0xd8 ? '.jpg' : '.png' : '.mp4'
      const localPath = (file.kind === 'image' ? 'images/' : 'videos/') + randomUUID() + ext
      const abs = assetAbsPath(projectId, localPath)
      created.push(abs)
      await mkdir(dirname(abs), { recursive: true })
      if (bytes) await writeFile(abs, bytes)
      else await normalizeVideo(file.path, abs, controller.signal)
      const after = await stat(file.path)
      if (after.size !== file.size || after.mtimeMs !== file.modified) throw new Error('File berubah saat disalin: ' + file.name)
      const size = await probeSize(abs)
      if (!size) throw new Error('Media tidak bisa dibaca: ' + file.name)
      const durationMs = file.kind === 'video' ? await probeDurationMs(abs) : undefined
      if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0)) throw new Error('Durasi video tidak valid: ' + file.name)
      staged.push({ file, clip, localPath, ...size, durationMs })
    }
    controller.signal.throwIfAborted()
    if (ticket.fingerprint !== fingerprint(clipsOf(projectId))) throw new Error('Adegan berubah saat impor berjalan. Tidak ada pasangan yang diterapkan; pilih ulang.')
    const assets: Asset[] = [], patches: { clipId: string; patch: Partial<Clip> }[] = []
    getDb().transaction(() => {
      for (const item of staged.sort((a,b) => a.file.kind === b.file.kind ? 0 : a.file.kind === 'image' ? -1 : 1)) {
        const asset = insertAsset({ projectId, clipId: item.clip.id, kind: item.file.kind, provider: 'local', prompt: item.file.name, localPath: item.localPath, width: item.width, height: item.height, durationMs: item.durationMs })
        const patch: Partial<Clip> = item.file.kind === 'image' ? { imageAssetId: asset.id, videoAssetId: null, motionType: 'camera', mediaInMs: 0 } : { videoAssetId: asset.id, motionType: 'video', mediaInMs: 0 }
        patchClip(item.clip.id, patch)
        assets.push(asset); patches.push({ clipId: item.clip.id, patch })
        if (item.file.kind === 'image' && item.clip.id === clips[0].id) touchProject(projectId, { coverAssetId: asset.id })
      }
      touchProject(projectId)
    })()
    committed = true
    tickets.delete(token)
    assets.forEach(asset => emit.asset(asset))
    patches.forEach(patch => emit.clip(patch))
    return { imported: staged.length, skipped: ticket.files.length - staged.length }
  } catch (error) {
    if (controller.signal.aborted && !committed) throw new Error('Impor dibatalkan. Tidak ada pasangan dari paket ini yang diterapkan.')
    throw error
  } finally {
    ticket.busy = false
    ticket.controller = undefined
    if (!committed) await Promise.all(created.map(path => rm(path, { force: true }).catch(() => {})))
  }
}
