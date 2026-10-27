export type EffectKind = 'knock' | 'steps' | 'wind' | 'creak' | 'ring' | 'chime' | 'tension'

export function effectKind(text: string): EffectKind | null {
  if (['knock', 'steps', 'wind', 'creak', 'ring', 'chime', 'tension'].includes(text.trim())) return text.trim() as EffectKind
  const rules: [RegExp, EffectKind][] = [
    [/knock|ketuk|gedor/i, 'knock'], [/footstep|langkah|berjalan|berlari|merayap|climb/i, 'steps'],
    [/phone|telephone|telepon|dering/i, 'ring'], [/creak|pintu.*(?:buka|tutup)|door.*(?:open|clos)/i, 'creak'],
    [/wind|angin|rustl/i, 'wind'], [/bell|lonceng|chime/i, 'chime'],
    [/muncul|terkejut|menoleh|berbalik|reveal|startl|suspense|tension|bayangan.*gerak/i, 'tension']
  ]
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? null
}

/** Original procedural audio; no third-party recording or license is needed for these fallback effects. */
export function synthesizeEffect(kind: EffectKind, rate = 24000): Float32Array {
  const durations: Record<EffectKind, number> = { knock: 0.9, steps: 1.6, wind: 3, creak: 1.3, ring: 1.4, chime: 1.2, tension: 1.5 }
  const samples = new Float32Array(Math.round(rate * durations[kind]))
  let seed = 7141
  let low = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 2147483648 - 1
    low += (noise - low) * 0.035
    let value = 0
    if (kind === 'wind') value = low * Math.sin(Math.PI * i / samples.length) * 0.8
    if (kind === 'knock' || kind === 'steps') {
      const interval = kind === 'knock' ? 0.25 : 0.45
      const local = t % interval
      value = Math.exp(-local * 45) * (0.35 * Math.sin(2 * Math.PI * 140 * local) + 0.2 * noise)
    }
    if (kind === 'creak') value = (Math.sin(2 * Math.PI * (160 * t + 90 * t * t)) + noise * 0.3) * 0.13 * Math.sin(Math.PI * i / samples.length)
    if (kind === 'ring') value = (Math.sin(2 * Math.PI * 660 * t) + Math.sin(2 * Math.PI * 880 * t)) * 0.12 * (Math.sin(2 * Math.PI * 9 * t) > -0.3 ? 1 : 0.1)
    if (kind === 'chime') value = (Math.sin(2 * Math.PI * 880 * t) + 0.5 * Math.sin(2 * Math.PI * 1320 * t)) * 0.2 * Math.exp(-t * 4)
    if (kind === 'tension') value = (Math.sin(2 * Math.PI * (80 * t - 15 * t * t)) * 0.2 + low * 0.4) * Math.sin(Math.PI * i / samples.length)
    const fade = Math.min(1, i / (rate * 0.008), (samples.length - 1 - i) / (rate * 0.04))
    samples[i] = Math.max(-0.9, Math.min(0.9, value * fade))
  }
  return samples
}
