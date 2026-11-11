import type { AppSettings } from './types'

export const REFERENCE_CHARACTER_DESCRIPTION = 'Ikuti identitas karakter pada gambar referensi: wajah, rambut, proporsi tubuh dan pakaian. Pertahankan identitas ini ketika pose, ekspresi, aksi atau latar berubah.'
export const REFERENCE_STYLE_DESCRIPTION = 'Ikuti garis, warna, bayangan, tekstur dan tingkat detail gambar referensi. Terapkan gaya yang sama pada karakter, latar dan benda.'

/** Replacing an identity must not carry the previous character's name or appearance into the next prompt. */
export function channelReferencePatch(reference: string, target: 'character' | 'style' | 'visual'): Partial<AppSettings> {
  return {
    ...(target !== 'style' ? {
      channelCharacterEnabled: true,
      channelCharacterReference: reference,
      channelCharacterName: 'Karakter utama',
      channelCharacterDescription: REFERENCE_CHARACTER_DESCRIPTION
    } : {}),
    ...(target !== 'character' ? {
      channelStyleEnabled: true,
      channelStyleReference: reference,
      channelStyleDescription: REFERENCE_STYLE_DESCRIPTION
    } : {})
  }
}
