import { readFileSync, statSync } from 'node:fs'
import { nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import { binPath } from './paths'

/** Gradio defaults to WebP, which nativeImage cannot decode on Windows. */
export async function normalizeGeneratedImage(bytes: Buffer): Promise<Buffer> {
  const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!webp) {
    validateImageBytes(bytes)
    return bytes
  }
  const png = await new Promise<Buffer>((resolve, reject) => {
    const child = execFile(binPath(ffmpegStatic!),
      ['-v', 'error', '-f', 'webp_pipe', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'],
      { windowsHide: true, encoding: 'buffer', timeout: 30000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => error ? reject(new Error('Gambar WebP dari penyedia tidak bisa dikonversi ke PNG.')) : resolve(stdout))
    child.stdin?.on('error', () => { /* The callback reports decoder failures. */ })
    child.stdin?.end(bytes)
  })
  validateImageBytes(png)
  return png
}

const checked = new Map<string, string>()

/** Reject blank/filter-placeholder files, while allowing genuinely dark scenes with visible detail. */
export function validateImageBytes(bytes: Buffer): { width: number; height: number } {
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) throw new Error('Gambar tidak bisa dibaca. Coba buat ulang gambar adegan ini.')
  const size = image.getSize()
  const pixels = image.resize({ width: 64, height: 64, quality: 'good' }).toBitmap()
  let sum = 0
  let squared = 0
  let visible = 0
  let min = 255
  let max = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 16) continue
    const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    sum += light
    squared += light * light
    min = Math.min(min, light)
    max = Math.max(max, light)
    visible++
  }
  const mean = sum / Math.max(1, visible)
  const deviation = Math.sqrt(Math.max(0, squared / Math.max(1, visible) - mean * mean))
  if (visible < 40 || (max - min < 4 && deviation < 1) || (mean < 3 && deviation < 1.5))
    throw new Error('Hasil gambar kosong, hitam polos, atau transparan. Gambar ini tidak dipakai; buat ulang dengan prompt yang lebih jelas atau periksa respons penyedia.')
  return size
}

export function validateImageFile(path: string): void {
  const stat = statSync(path)
  const signature = `${stat.size}:${stat.mtimeMs}`
  if (checked.get(path) === signature) return
  validateImageBytes(readFileSync(path))
  if (checked.size > 500) checked.clear()
  checked.set(path, signature)
}
