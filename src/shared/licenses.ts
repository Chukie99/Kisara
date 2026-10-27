/** Freesound has returned both license names and Creative Commons URLs over time. */
export function soundLicense(raw: string): 'CC0' | 'CC BY' | 'CC BY-NC' | 'unknown' {
  if (/creativecommons\.org\/publicdomain\/zero\/|creative commons 0|\bcc0\b/i.test(raw)) return 'CC0'
  if (/creativecommons\.org\/licenses\/by-nc\/|attribution noncommercial|cc by-nc/i.test(raw)) return 'CC BY-NC'
  if (/creativecommons\.org\/licenses\/by\/|^attribution(?:\s|$)|^cc by(?:\s|$)/i.test(raw)) return 'CC BY'
  return 'unknown'
}
