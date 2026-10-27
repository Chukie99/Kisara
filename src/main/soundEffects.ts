import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { effectKind, synthesizeEffect } from '@shared/builtinSounds'
import { sceneStart } from '@shared/sound'
import type { Asset, Job, SoundCue } from '@shared/types'
import { emit } from './events'
import { runJob } from './jobs'
import { assetAbsPath } from './paths'
import { activeProjectJob, clipsOf, getProject, insertAsset, insertJob, patchEditor } from './repo'
import { getSecret } from './secrets'
import { generateSoundPlan } from './story'
import { pcmToWav, probeDurationMs } from './services/audio'
import * as freesound from './services/freesound'

function fallbackPlan(projectId: string): SoundCue[] {
  let previous: string | null = null
  return clipsOf(projectId).flatMap((c) => {
    const kind = effectKind(`${c.narration} ${c.story}`)
    if (!kind || kind === previous) return []
    previous = kind
    return [{ clipId: c.id, query: kind, label: `Efek ${kind}`, reason: 'Mengikuti aksi dalam adegan; dibuat dengan audio bawaan.' }]
  }).slice(0, 12)
}

function builtinAsset(projectId: string, cue: SoundCue): Asset | null {
  const kind = effectKind(cue.query) ?? effectKind(clipsOf(projectId).find((clip) => clip.id === cue.clipId)?.narration ?? '')
  if (!kind) return null
  const samples = synthesizeEffect(kind)
  const pcm = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, i) => pcm.writeInt16LE(Math.round(sample * 32767), i * 2))
  const rel = `sfx/${randomUUID()}.wav`
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, pcmToWav(pcm))
  return insertAsset({ projectId, kind: 'sfx', provider: 'builtin', prompt: cue.label, localPath: rel, durationMs: Math.round(samples.length / 24), meta: { author: 'Kisara', license: 'Audio sintetis bawaan · boleh dipakai dalam konten', effectKind: kind } })
}

/** Adds real audio tracks, rather than stopping at suggestions; never replaces effects placed by hand. */
export async function ensureSoundEffects(projectId: string, signal: AbortSignal, progress?: (message: string) => void): Promise<number> {
  if (getProject(projectId).editor.autoSound === false) return 0
  let cues = getProject(projectId).editor.soundPlan?.filter((cue) => clipsOf(projectId).some((c) => c.id === cue.clipId)) ?? []
  if (!cues.length) {
    try { cues = await generateSoundPlan(projectId) } catch { cues = fallbackPlan(projectId) }
    if (!cues.length) cues = fallbackPlan(projectId)
  }
  signal.throwIfAborted()
  patchEditor(projectId, { soundPlan: cues })
  emit.editor({ projectId, patch: { soundPlan: cues } })
  let added = 0
  for (const cue of cues.slice(0, 12)) {
    signal.throwIfAborted()
    const clips = clipsOf(projectId)
    const start = sceneStart(clips, cue.clipId)
    if (start == null) continue
    if ((getProject(projectId).editor.sfx ?? []).some((fx) => fx.clipId === cue.clipId || (!fx.clipId && Math.abs(fx.start - start) < 0.5))) continue
    progress?.(`Menyiapkan efek: ${cue.label}`)
    let asset: Asset | null = null
    if (getSecret('freesound')) {
      try {
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(20000)])
        const hit = (await freesound.search(cue.query, 3, requestSignal))[0]
        if (hit) {
          const bytes = await freesound.download(hit.url, requestSignal)
          signal.throwIfAborted()
          const rel = `sfx/${randomUUID()}.mp3`
          const abs = assetAbsPath(projectId, rel)
          mkdirSync(dirname(abs), { recursive: true })
          writeFileSync(abs, bytes)
          const durationMs = await probeDurationMs(abs)
          if (durationMs < 50) throw new Error('Berkas efek suara kosong.')
          asset = insertAsset({ projectId, kind: 'sfx', provider: 'freesound', prompt: hit.name, localPath: rel, durationMs, meta: { author: hit.author, license: hit.license, pageUrl: hit.pageUrl, sourceId: hit.id } })
        }
      } catch { signal.throwIfAborted() }
    }
    signal.throwIfAborted()
    if (!asset) asset = builtinAsset(projectId, cue)
    if (!asset) continue
    emit.asset(asset)
    const current = getProject(projectId)
    if (!clipsOf(projectId).some((c) => c.id === cue.clipId) || current.editor.autoSound === false || (current.editor.sfx ?? []).some((fx) => fx.clipId === cue.clipId || (!fx.clipId && Math.abs(fx.start - start) < 0.5))) continue
    const sfx = [...(current.editor.sfx ?? []), { id: randomUUID(), assetId: asset.id, clipId: cue.clipId, offsetSec: 0, start, volumeDb: -12, source: 'auto' as const, label: cue.label }]
    patchEditor(projectId, { sfx })
    emit.editor({ projectId, patch: {}, sfxAdded: [sfx[sfx.length - 1]] })
    added++
  }
  return added
}

export function generateSoundEffects(projectId: string): Job {
  const active = activeProjectJob(projectId, 'sfx')
  if (active) return active
  getProject(projectId)
  const job = insertJob({ projectId, kind: 'sfx', provider: 'sound-design' })
  emit.job(job)
  return runJob(job, 'tts', async (ctx) => {
    const count = await ensureSoundEffects(projectId, ctx.signal, (message) => ctx.progress(0.3, message))
    return { message: `${count} efek suara ditambahkan; efek yang sudah terpasang dipertahankan.` }
  })
}
