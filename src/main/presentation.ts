import { duplicateProject, getBundle, saveSnapshot, divideUnproducedShots, touchProject, patchClip, patchClipText } from './repo'
import type { ProjectBundle } from '@shared/types'

/** Build a clean production version without discarding an already-produced project's assets. */
export function createPresentationVersion(projectId: string): ProjectBundle {
  const original = getBundle(projectId)
  if (!original.clips.length) throw new Error('Susun naskah dulu sebelum membuat versi penyajian baru.')
  if (original.jobs.some(job => job.status === 'running' || job.status === 'queued')) throw new Error('Tunggu pekerjaan proyek selesai atau batalkan sebelum membuat versi penyajian baru.')
  const copy = duplicateProject(projectId), bundle = getBundle(copy.id)
  saveSnapshot({ project: { ...bundle.project, title: original.project.title + ' · Penyajian baru', status: 'script', step: 2,
    editor: { ...bundle.project.editor, presentation: { version: 1, shots: [] }, publication: undefined, scriptAssessment: undefined,
      overlays: [], sfx: [], soundPlan: undefined, captionStyle: 'none' } }, characters: bundle.characters,
    clips: bundle.clips.map(clip => ({ ...clip, visualPrompt: '', visualSource: null, videoPrompt: '', imageAssetId: null, videoAssetId: null, audioAssetId: null,
      motionType: 'camera', cameraPreset: 'pushhold', motionStrength: 'halus', videoCamera: 'static', videoStrength: 'halus', transition: 'cut', transitionMs: null,
      mediaInMs: 0, voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 })) })
  // Snapshot saves editable fields; media links belong to main and must be detached explicitly.
  for (const clip of bundle.clips) {
    patchClip(clip.id, { imageAssetId: null, videoAssetId: null, audioAssetId: null })
    patchClipText(clip.id, { visualSource: null })
  }
  touchProject(copy.id, { coverAssetId: null })
  divideUnproducedShots(copy.id)
  return getBundle(copy.id)
}
