import type { AppSettings, KeyStatus, KeyTestResult, TtsProvider } from '@shared/types'

export const TTS_NAMES: Record<TtsProvider, string> = {
  'f5-local': 'F5-TTS lokal',
  'f5-hf': 'F5-TTS · Hugging Face',
  gemini: 'Gemini TTS',
  elevenlabs: 'ElevenLabs',
  supertonic: 'Supertonic'
}

/** Order the narrator services are offered in, in the project step and in the new-project form. */
export const TTS_ORDER: TtsProvider[] = ['gemini', 'elevenlabs', 'supertonic', 'f5-hf', 'f5-local']

/**
 * Whether each narrator voice service can be used. Gemini and ElevenLabs need a saved key that did not fail
 * its last check; Supertonic runs locally and needs its folder set up instead. `reason` says why not.
 */
export function ttsReadiness(
  keys: KeyStatus[],
  supertonic: KeyTestResult | null,
  settings?: AppSettings | null,
  f5Local?: KeyTestResult | null
): Record<TtsProvider, { ok: boolean; reason: string | null }> {
  const one = (p: 'gemini' | 'elevenlabs'): { ok: boolean; reason: string | null } => {
    const k = keys.find((x) => x.provider === p)
    const name = p === 'gemini' ? 'Gemini' : 'ElevenLabs'
    if (!k?.configured) return { ok: false, reason: `Kunci ${name} belum diisi` }
    if (k.lastOk === false) return { ok: false, reason: `Kunci ${name} tidak valid` }
    return { ok: true, reason: null }
  }
  return {
    'f5-local': f5Local?.ok ? { ok: true, reason: null } : { ok: false, reason: f5Local?.message ?? 'Jalankan studio F5 lokal dan tes di Pengaturan' },
    'f5-hf': settings?.f5Space && settings.f5Endpoint && settings.f5Reference && settings.f5RefText.trim() && settings.f5VoiceId ? { ok: true, reason: null } : { ok: false, reason: 'Lengkapi Space dan referensi F5 di Pengaturan' },
    gemini: one('gemini'),
    elevenlabs: one('elevenlabs'),
    supertonic: supertonic?.ok
      ? { ok: true, reason: null }
      : { ok: false, reason: supertonic?.message ?? 'Supertonic belum diatur' }
  }
}

/** The preferred provider when it is usable, otherwise the first usable one, otherwise the preferred one anyway. */
export function usableTts(preferred: TtsProvider, keys: KeyStatus[], supertonic: KeyTestResult | null, settings?: AppSettings | null, f5Local?: KeyTestResult | null): TtsProvider {
  // An offline clone server must not silently replace the user's selected voice with another provider.
  if (preferred === 'f5-local') return preferred
  const ready = ttsReadiness(keys, supertonic, settings, f5Local)
  if (ready[preferred].ok) return preferred
  return TTS_ORDER.find((p) => ready[p].ok) ?? preferred
}
