import { BrowserWindow } from 'electron'
import { EVENTS } from '@shared/api'
import type { Asset, CharacterPatchEvent, ClipPatchEvent, EditorSettings, Job, ProjectBundle, ScriptProgress, SfxOverlay, WhisperStatus } from '@shared/types'

function send(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

export const emit = {
  visualProgress: (progress: ScriptProgress): void => send(EVENTS.visualProgress, progress),
  scriptProgress: (progress: ScriptProgress): void => send(EVENTS.scriptProgress, progress),
  production: (bundle: ProjectBundle): void => send(EVENTS.production, bundle),
  editor: (e: { projectId: string; patch: Partial<EditorSettings>; sfxAdded?: SfxOverlay[] }): void => send(EVENTS.editor, e),
  job: (job: Job): void => send(EVENTS.job, job),
  clip: (e: ClipPatchEvent): void => send(EVENTS.clip, e),
  character: (e: CharacterPatchEvent): void => send(EVENTS.character, e),
  asset: (asset: Asset): void => send(EVENTS.asset, asset),
  whisper: (status: WhisperStatus): void => send(EVENTS.whisper, status)
}
