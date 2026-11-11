import { app, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './paths'
import { getSettings, setSettings } from './settings'
import { normalizeGeneratedImage } from './imageQuality'
import { channelReferencePatch } from '@shared/channelVisual'
import { customStyleReference, getStyle } from '@shared/styles'

export function channelCharacterKey(): string {
  const s = getSettings()
  return s.channelCharacterEnabled ? JSON.stringify([s.channelCharacterName, s.channelCharacterDescription, s.channelCharacterReference]) : ''
}
export function referenceBytes(reference: string): Buffer {
  const file = reference === 'builtin-kenzo'
    ? join(app.isPackaged ? process.resourcesPath : app.getAppPath(), app.isPackaged ? 'kenzo.png' : 'resources/kenzo.png')
    : /^[a-f0-9-]{36}\.png$/.test(reference) ? join(dataDir(), 'channel-character', reference) : ''
  if (!file) throw new Error('Upload gambar referensi di Pengaturan → Umum.')
  return readFileSync(file)
}
export function channelCharacterBytes(): Buffer | null {
  const s = getSettings()
  return s.channelCharacterEnabled ? referenceBytes(s.channelCharacterReference) : null
}
export function channelCharacterPrompt(): string {
  const s = getSettings()
  if (!s.channelCharacterEnabled) return ''
  return `Main channel character: ${s.channelCharacterName}. ${s.channelCharacterDescription}. The FIRST attached image is this character identity sheet, not the scene layout. The scene Action determines who is visible. Use this identity ONLY when the main channel character is actually present. Object-only details, diagrams, locations and shots of other people must NOT acquire a presenter. When present, depict ONE instance of this same character, matching the face, hair, proportions and clothing from the reference. Follow its illustration style unless a GLOBAL VISUAL STYLE reference specifies the rendering style. Change only pose, expression and action to tell the scene. Do not reproduce the turnaround sheet, its multiple views, white background or guide lines. Replace any conflicting generic main-character appearance in the scene description with this identity. Keep supporting characters distinct.\n\n`
}
export async function importStyleReference(file: string): Promise<string> {
  if (statSync(file).size > 20 * 1024 * 1024) throw new Error('Gambar maksimal 20 MB.')
  const bytes = await normalizeGeneratedImage(readFileSync(file))
  // Keep an immutable owned copy, independent of the original Downloads file.
  const png = nativeImage.createFromBuffer(bytes).toPNG()
  if (!png.length) throw new Error('Gambar referensi tidak dapat dibaca.')
  const name = randomUUID() + '.png'
  mkdirSync(join(dataDir(), 'channel-character'), { recursive: true })
  writeFileSync(join(dataDir(), 'channel-character', name), png)
  return name
}
export async function importChannelCharacter(file: string, target: 'character' | 'style' | 'visual' = 'character'): Promise<void> {
  setSettings(channelReferencePatch(await importStyleReference(file), target))
}
export function channelCharacterPreview(): string | null {
  const bytes = channelCharacterBytes()
  return bytes ? 'data:image/png;base64,' + bytes.toString('base64') : null
}
export function channelStyleKey(styleId?: string): string {
  if (styleId?.startsWith('custom:')) return styleId
  const s = getSettings()
  return s.channelStyleEnabled ? JSON.stringify([s.channelStyleDescription, s.channelStyleReference]) : ''
}
export function channelStyleBytes(styleId?: string): Buffer | null {
  if (styleId?.startsWith('custom:')) {
    const reference = customStyleReference(styleId)
    return reference ? referenceBytes(reference) : null
  }
  const s = getSettings()
  return s.channelStyleEnabled ? referenceBytes(s.channelStyleReference) : null
}
export function channelStylePrompt(referenceNumber: number, styleId?: string): string {
  if (styleId?.startsWith('custom:')) return `GLOBAL VISUAL STYLE: ${getStyle(styleId).prompt}. ${referenceNumber ? `Attached image number ${referenceNumber} defines rendering style only, not cast or layout.` : ''} Apply this style to all people and backgrounds, preserving character identity. Do not copy reference objects or guide lines.\n\n`
  const s = getSettings()
  if (!s.channelStyleEnabled) return ''
  return `GLOBAL VISUAL STYLE: attached image number ${referenceNumber} defines rendering style, not additional cast or scene layout. Its visual rendering takes priority over conflicting descriptive style words. ${s.channelStyleDescription}. Apply this same linework, shading, palette, material treatment and level of detail to ALL supporting people/NPCs, buildings, backgrounds, plants, furniture and props. Supporting people have distinct identities but the same visual design language. Preserve the main character identity. Do not copy objects, reference-sheet layout or guide lines. This global style overrides conflicting scene style instructions.\n\n`
}
export function channelStylePreview(): string | null {
  const bytes = channelStyleBytes()
  return bytes ? 'data:image/png;base64,' + bytes.toString('base64') : null
}

/** Compare decoded pixels: PNG metadata/compression can differ after a normal upload. */
export function sameReferenceImage(a: Buffer, b: Buffer): boolean {
  if (a.equals(b)) return true
  const first = nativeImage.createFromBuffer(a), second = nativeImage.createFromBuffer(b)
  if (first.isEmpty() || second.isEmpty()) throw new Error('Gambar referensi tidak dapat dibaca.')
  const x = first.getSize(), y = second.getSize()
  return x.width === y.width && x.height === y.height && first.toBitmap().equals(second.toBitmap())
}
