import type { Clip, Project } from './types'
import type { ScriptFinding } from './production'
import { stripVoiceTags } from './speech'

/** Full input equality avoids applying a review after edits, without a lossy browser hash. */
export function scriptReviewKey(project: Project, clips: Clip[]): string {
  return JSON.stringify([project.id, project.language, project.synopsis, project.durationSec, project.editor.storyBrief, clips.map(c => [c.id, c.title, c.story, c.narration])])
}

export function inspectScript(project: Project, clips: Clip[]): ScriptFinding[] {
  const findings: ScriptFinding[] = []
  const add = (kind: ScriptFinding['kind'], title: string, detail: string, ids: string[], quote?: string) => findings.push({ id: 'local-' + findings.length, origin: 'local', kind, title, detail, clipIds: ids, quote })
  const seen = new Map<string, string>()
  for (const clip of clips) {
    const text = stripVoiceTags(clip.narration).trim()
    if (!text) { add('empty', 'Narasi adegan kosong', 'Isi narasinya atau hapus adegan yang tidak diperlukan.', [clip.id]); continue }
    const key = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (key.length > 50 && seen.has(key)) add('repeat', 'Narasi berulang', 'Dua adegan memiliki teks ucapan yang sama. Periksa apakah pengulangan memang dibutuhkan.', [seen.get(key)!, clip.id], text)
    else seen.set(key, clip.id)
    if (project.editor.storyBrief?.fictional === false && /pasti untung|dijamin untung|cuan pasti|tanpa risiko/i.test(text))
      add('source', 'Periksa konteks klaim keuntungan atau risiko', 'Pastikan narasi tidak menjanjikan hasil pasti. Temuan ini pencarian frasa, bukan kesimpulan bahwa klaimnya salah.', [clip.id], text)
  }
  if (project.editor.storyBrief?.fictional === false) {
    const all = clips.map(c => stripVoiceTags(c.narration)).join(' ')
    const unexplained = ['inflasi', 'diversifikasi', 'likuiditas', 'volatilitas', 'bunga majemuk', 'imbal hasil', 'obligasi', 'reksa dana'].filter(term => {
      const at = all.toLocaleLowerCase().indexOf(term)
      return at >= 0 && !/artinya|adalah|berarti|sederhananya|contohnya|yaitu|maksudnya|merupakan/i.test(all.slice(Math.max(0, at - 80), at + term.length + 180))
    })
    if (unexplained.length) add('clarity', 'Periksa penjelasan istilah', 'Belum terdeteksi penjelasan dekat istilah: ' + unexplained.join(', ') + '. Jelaskan dengan bahasa sehari-hari bila belum jelas; pemeriksaan ini bisa melewatkan penjelasan dengan susunan lain.', clips.filter(c => unexplained.some(term => c.narration.toLocaleLowerCase().includes(term))).map(c => c.id))
    add('source', 'Fakta belum diverifikasi oleh aplikasi', 'Cocokkan angka, periode data, kutipan dan kesimpulan dengan sumber yang dapat diperiksa. Catatan dari transkrip bukan verifikasi independen.', [])
  }
  const total = clips.reduce((sum,c) => sum + c.durationMs, 0) / 1000
  if (total > project.durationSec * 1.2) add('pacing', 'Durasi melebihi target', 'Timeline saat ini sekitar ' + Math.round(total / 60 * 10) / 10 + ' menit. Tinjau pengulangan atau sesuaikan target; jangan mempercepat suara hanya untuk mengejar durasi.', [])
  return findings.slice(0, 30)
}
