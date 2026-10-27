import { sceneCharacters } from './characters'
import { needsVisual } from './script'
import { narrationNeedsRefresh, stripVoiceTags } from './speech'
import { getStyle } from './styles'
import type { Clip, ProjectBundle } from './types'

export function storyTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** Integer milliseconds are accumulated before formatting, so display rounding cannot cause drift. */
export function sceneSpans(clips: Pick<Clip, 'id' | 'durationMs'>[]) {
  let cursor = 0
  return clips.map((clip, i) => {
    const startMs = cursor
    cursor += Math.max(0, Math.round(clip.durationMs))
    return { index: i + 1, clipId: clip.id, startMs, endMs: cursor, timestamp: `[${storyTime(startMs)}–${storyTime(cursor)}]` }
  })
}

export interface FlowPlan {
  mode: 'image' | 'video'
  title: string
  synopsis: string
  style: string
  look: 'project' | 'cartoon-indonesia'
  aspect: string
  timing: 'estimated' | 'audio' | 'mixed'
  durationMs: number
  scenes: { index: number; clipId: string; startMs: number; endMs: number; timestamp: string; title: string; narration: string; prompt: string; ready: boolean; videoPrompt: string; videoReady: boolean; motion: string }[]
}

const SIMPLE_CARTOON = 'Simple everyday 2D cartoon drawing. Thick slightly imperfect black outlines, broad rounded shapes, solid flat colors, minimal facial marks and a few basic background objects. At most one flat shadow. Keep expressions appropriate to the scene. No photorealism, semi-realistic rendering, 3D, gradients, skin texture, detailed hair strands, glossy skin, dramatic cinematic lighting or polished glamour illustration.'
const INDONESIAN_CAST = 'Casting and setting priority: depict ordinary Indonesian residents, with varied Southeast Asian faces, natural kuning langsat to sawo matang skin tones and mostly black or dark brown hair. Use everyday local clothing and an Indonesian environment appropriate to the story. Keep individual ages, body types, hairstyles, expressions and wardrobe distinct; do not turn everyone into the same face. Avoid idealized celebrity or fashion-model styling. Preserve any different origin explicitly stated in the story; generic casting defaults from an old automatic visual description are not story facts.'

/** Old shot plans may contain rendering adjectives that fight the simpler export-only art direction. */
function simpleFlowDescription(text: string): string {
  return text.replace(/\b(?:cinematic|photorealistic|hyperrealistic|semi[- ]realistic|highly detailed|high[- ]detail|detailed painted|glossy|polished|dramatic lighting)\b/gi, '').replace(/[ \t]{2,}/g, ' ').trim()
}

/** Prefixes keep lexical sorting stable; the source title is retained in Indonesian rather than translated. */
export function flowAssetName(scene: Pick<FlowPlan['scenes'][number], 'index' | 'title'>): string {
  const title = Array.from(scene.title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 96).join('').replace(/[ .]+$/, '') || `Adegan ${scene.index}`
  return `${String(scene.index).padStart(3, '0')} - ${title}`
}

/** The same ordered rows drive the UI, clipboard, TXT and DOCX; labels never enter the image prompt. */
export function buildFlowPlan(bundle: Pick<ProjectBundle, 'project' | 'clips' | 'characters' | 'assets'>): FlowPlan {
  const { project, clips, assets, characters } = bundle
  const style = getStyle(project.styleId)
  const look = project.editor?.flowLook === 'cartoon-indonesia' ? 'cartoon-indonesia' : 'project'
  const simple = look === 'cartoon-indonesia'
  const voiced = clips.filter((clip) => {
    const asset = assets.find((a) => a.id === clip.audioAssetId)
    return clip.narration.trim() && asset?.kind === 'audio' && !narrationNeedsRefresh(asset, clip, project)
  }).length
  const spans = sceneSpans(clips)
  return {
    mode: project.editor?.flowMode === 'video' ? 'video' : 'image',
    title: project.title, synopsis: project.synopsis, style: simple ? 'Kartun Indonesia sederhana' : style.name, look, aspect: project.aspectRatio,
    timing: voiced === clips.length && clips.length > 0 ? 'audio' : voiced > 0 ? 'mixed' : 'estimated',
    durationMs: spans.at(-1)?.endMs ?? 0,
    scenes: clips.map((clip, i) => {
      const ready = !!stripVoiceTags(clip.narration).trim() && !needsVisual(clip)
      const identities = sceneCharacters(clip, characters).map((c) => `${c.name}: ${simple ? simpleFlowDescription(c.description) : c.description}`).join('\n')
      const motion = clip.videoPrompt ?? ''
      const videoReady = ready && !!stripVoiceTags(motion).trim()
      return { ...spans[i], title: clip.title, narration: stripVoiceTags(clip.narration), ready, motion, videoReady,
        videoPrompt: videoReady ? [
          'Use the supplied scene image as the first frame. Preserve its exact characters, faces, ages, wardrobe, setting, composition and illustration style throughout the shot.',
          `Motion direction: ${stripVoiceTags(motion)}`,
          'Animate the subjects or physical environment, not just a zoom or pan over a frozen picture. Keep movements believable, modest and consistent with the action visible in the reference. Use one continuous shot, without cuts or a montage. Do not invent extra people, props or story events.',
          `Narrative context only (do not speak or display it): ${stripVoiceTags(clip.narration)}`,
          'The supplied frame governs what is visible. Do not depict off-screen or metaphorical events literally. Do not animate lips for narration; no spoken dialogue, voiceover, music, subtitles, text, numbers, logos or watermarks. Keep the original aspect ratio. Finish on a stable pose.'
        ].join('\n\n') : '',
        prompt: ready ? [simple ? SIMPLE_CARTOON : style.prompt, `Aspect ratio ${project.aspectRatio}. One single still frame, no panels.`, identities && `Character continuity:\n${identities}`, simple ? simpleFlowDescription(clip.visualPrompt) : clip.visualPrompt, simple && INDONESIAN_CAST, simple && 'Rendering priority: use only the location, visible action, identity and wardrobe from the shot description above. Draw them as a low-detail flat 2D cartoon; do not inherit its old rendering style. Reduce scenery to a few recognizable shapes.', 'No text, timestamps, numbers, subtitles, speech bubbles, watermarks or logos.'].filter(Boolean).join('\n\n') : '' }
    })
  }
}

export function flowPrompt(scene: FlowPlan['scenes'][number], mode: FlowPlan['mode']): string {
  return mode === 'video' ? scene.videoPrompt : scene.prompt
}

export function flowReady(scene: FlowPlan['scenes'][number], mode: FlowPlan['mode']): boolean {
  return mode === 'video' ? scene.videoReady : scene.ready
}

export function flowSceneText(scene: FlowPlan['scenes'][number], mode: FlowPlan['mode'] = 'image'): string {
  if (mode === 'video') return `${String(scene.index).padStart(2, '0')} · ${scene.timestamp} · ${scene.title}\nGambar acuan / nama video: ${flowAssetName(scene)}\nDurasi adegan di timeline: ${((scene.endMs - scene.startMs) / 1000).toFixed(1)} detik (pilih durasi yang tersedia di Flow, lalu sesuaikan di editor).\n\nNARASI\n${scene.narration}\n\nPROMPT IMAGE TO VIDEO\n${scene.videoPrompt || '(Gerak belum siap; susun/perbarui prompt atau isi arahan gerak adegan.)'}`
  return `${String(scene.index).padStart(2, '0')} · ${scene.timestamp} · ${scene.title}\nNama gambar: ${flowAssetName(scene)}\n\nNARASI\n${scene.narration}\n\nPROMPT GAMBAR\n${scene.prompt || '(Prompt belum siap; susun atau perbarui visual dahulu.)'}`
}

export function flowText(plan: FlowPlan): string {
  if (plan.mode === 'video') return `${plan.title}\nKisara · Image to Video untuk Google Flow\nRasio: ${plan.aspect} · Durasi timeline: ${storyTime(plan.durationMs)}\n${plan.timing === 'audio' ? 'Timestamp mengikuti audio.' : 'Timestamp masih perkiraan; ekspor ulang setelah TTS/timeline berubah.'}\nPilih gambar bernama sama untuk setiap adegan sebagai frame awal di Flow, lalu tempel PROMPT IMAGE TO VIDEO. Satu adegan menjadi satu video terpisah. Nama dan timestamp hanya label, bukan isi gambar. Durasi dan gerakan akhir mengikuti model Flow yang kamu pilih. Buang audio hasil Flow bila ada; gunakan narasi Kisara.\n\n${plan.scenes.map((scene) => flowSceneText(scene, 'video')).join('\n\n' + '─'.repeat(48) + '\n\n')}`
  return `${plan.title}\nKisara · Panduan Google Flow\nGaya: ${plan.style} · Rasio: ${plan.aspect}\nDurasi: ${storyTime(plan.durationMs)}\nWaktu: ${plan.timing === 'audio' ? 'Mengikuti timeline audio.' : 'Perkiraan; buat ulang ekspor setelah narasi TTS selesai atau timeline berubah.'}\nNomor dan timestamp adalah label. Salin hanya isi PROMPT GAMBAR ke generator gambar.\n\nSINOPSIS\n${plan.synopsis}\n\n${plan.scenes.map((scene) => flowSceneText(scene)).join('\n\n' + '─'.repeat(48) + '\n\n')}`
}

/** One spoken paragraph per scene; labels and timestamps remain outside the text pasted into TTS. */
export function flowNarrationParagraph(scene: FlowPlan['scenes'][number]): string {
  return scene.narration.replace(/\s+/g, ' ').trim()
}

export function flowNarrationText(plan: FlowPlan): string {
  if (!plan.scenes.length || plan.scenes.some((scene) => !flowNarrationParagraph(scene))) throw new Error('Ada narasi adegan yang masih kosong. Lengkapi sebelum menyalin atau mengekspor naskah.')
  return plan.scenes.map(flowNarrationParagraph).join('\n\n')
}

export function flowBatches(plan: FlowPlan) {
  return Array.from({ length: Math.ceil(plan.scenes.length / 10) }, (_, index) => {
    const scenes = plan.scenes.slice(index * 10, index * 10 + 10)
    return { index, scenes, label: `Adegan ${String(scenes[0].index).padStart(2, '0')}–${String(scenes.at(-1)!.index).padStart(2, '0')}`, ready: scenes.every((scene) => flowReady(scene, plan.mode)) }
  })
}

/** This is a request for an Agent to create separate assets, not a collage prompt or an API integration. */
export function flowAgentBatch(plan: FlowPlan, batchIndex: number): string {
  if (!Number.isInteger(batchIndex) || batchIndex < 0) throw new Error('Pilih paket adegan yang tersedia.')
  const batch = flowBatches(plan)[batchIndex]
  if (!batch) throw new Error('Paket adegan tidak ditemukan.')
  if (!batch.ready) throw new Error('Ada prompt dalam paket ini yang belum sesuai naskah. Susun/perbarui prompt dahulu.')
  if (plan.mode === 'video') return [
    `Create ${batch.scenes.length} SEPARATE image-to-video clips, one per SCENE below. Never combine scenes into one video, montage, collage or split-screen.`,
    'For each scene, find the supplied reference image with the exact REFERENCE IMAGE name and use it as the first frame. If that image is missing or ambiguous, ask for it; never invent a replacement or silently switch to text-to-video.',
    'Each VIDEO DESCRIPTION is a separate animation task. Move subjects or the environment as directed; a zoom over a still image is not enough. Preserve the supplied image style and identities.',
    'ASSET NAME is the exact Indonesian title and filename stem for the output. Keep its numeric prefix, do not translate it, and never draw labels in video pixels. Rename only if available; otherwise provide a mapping without claiming success.',
    'Timeline duration is an editing target, not a guarantee of model generation length. Choose a supported duration and report the actual result. Do not claim exact timing or unavailable features. No narration, dialogue or music; keep the Kisara narrator separate.',
    ...batch.scenes.map((scene) => `SCENE ${String(scene.index).padStart(2, '0')}: ${scene.timestamp}\nREFERENCE IMAGE: "${flowAssetName(scene)}"\nASSET NAME: "${flowAssetName(scene)}"\nTIMELINE TARGET: ${((scene.endMs - scene.startMs) / 1000).toFixed(1)} seconds\nVIDEO DESCRIPTION:\n${scene.videoPrompt}`),
    'Execute one generation per scene, sequentially if needed. If separate generation or reference attachment is unavailable, explain the limitation. Reply in Indonesian with one row per scene: number, reference image, output asset, actual duration, status.'
  ].join('\n\n')
  return [
    `Generate ${batch.scenes.length} SEPARATE image assets, one for each scene listed below.`,
    'Treat each SCENE block as an independent image-generation task. Execute one separate generation for each scene; each result must depict ONLY its own scene.',
    'Never combine scenes into one image. No collage, contact sheet, storyboard grid, comic page, panels, split screen, or numbered tiles.',
    'Scene identifiers are task labels, not text to draw. Keep character identities consistent and honor the wardrobe, location and action specified for each scene. Use character references when supplied.',
    'ASSET NAMING: use the exact ASSET NAME supplied for each scene as its asset title and download filename stem. Keep the Indonesian title unchanged; do not translate it to English or invent a new title. The numeric prefix is mandatory. Never draw the name or number inside the image.',
    'Use only IMAGE DESCRIPTION as the visual generation prompt. ASSET NAME is metadata for naming the result, not visual content.',
    'After generating each image, name or rename that asset to its ASSET NAME before moving to the next scene, if asset renaming is available. If it is unavailable, say so and provide the mapping; do not claim that you renamed it.',
    ...(plan.look === 'cartoon-indonesia' ? ['This batch deliberately uses a SIMPLE INDONESIAN 2D CARTOON look. Apply the new low-detail flat drawing direction even if earlier assets in this Flow project used another style. References may guide the individual role, hairstyle and wardrobe, but must not force a polished or realistic rendering.'] : []),
    'If you cannot run the tasks together, process them sequentially until each scene has its own separate asset. Do not substitute a combined image. If separate generations are unavailable, explain that limitation instead.',
    ...batch.scenes.map((scene) => `SCENE ${String(scene.index).padStart(2, '0')}:\nASSET NAME: ${JSON.stringify(flowAssetName(scene))}\nIMAGE DESCRIPTION:\n${scene.prompt}`),
    `Create the ${batch.scenes.length} separate image assets now. Reply in Indonesian with a completion table containing the scene number, exact ASSET NAME and a brief description identifying the image. Do not translate the supplied titles.`
  ].join('\n\n')
}

/** A separate human-readable map keeps asset metadata out of image pixels and spoken narration. */
export function flowImageMapText(plan: FlowPlan): string {
  return [plan.title, 'URUTAN GAMBAR & NARASI', 'Nama berikut adalah judul aset / nama file tanpa ekstensi. Nomor tidak dicetak dalam gambar.',
    ...plan.scenes.map((scene) => `${flowAssetName(scene)}\nAdegan ${String(scene.index).padStart(2, '0')} · ${scene.timestamp}\nNarasi: ${flowNarrationParagraph(scene) || '(Belum diisi)'}`)
  ].join('\n\n')
}
