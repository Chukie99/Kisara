import { request } from 'node:http'

/** Node fetch has a separate five-minute headers limit; browser video jobs can take longer. */
export function browserJson(url: string, key: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const target = new URL(url)
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !['/api/kisara/browser/image','/api/kisara/browser/image-batch'].includes(target.pathname) || target.username || target.password || target.search || target.hash) throw new Error('Alamat Flow lokal tidak valid.')
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request(target, { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      const chunks: Buffer[] = []; let size = 0
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 64 * 1024 * 1024) { res.destroy(new Error('Respons Flow terlalu besar.')); return }
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('aborted', () => reject(new Error('Koneksi Flow terputus. Hasil mungkin sudah dibuat; jangan kirim ulang.')))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode || 502, headers: { 'Content-Type': 'application/json' } })))
    })
    req.on('error', reject)
    req.end(payload)
  })
}
