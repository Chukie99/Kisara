const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { build } = require('esbuild')

;(async () => {
  const dir = path.resolve('tmp/bugcheck/visual-shots-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  await build({ entryPoints: ['src/shared/visualShots.ts'], bundle: true, platform: 'node', alias: { '@shared': path.resolve('src/shared') }, outfile: path.join(dir, 'shots.cjs') })
  const { visualShotParts, canDivideVisual } = require(path.join(dir, 'shots.cjs'))
  await build({ entryPoints: ['src/shared/speech.ts'], bundle: true, platform: 'node', outfile: path.join(dir, 'speech.cjs') })
  const { narrationTakeText } = require(path.join(dir, 'speech.cjs'))
  assert.equal(narrationTakeText([{ narration: 'Ia memeriksa' }, { narration: 'uang di rekening.' }, { narration: 'Lalu menutup ponsel.' }], '\n<long pause>\n'), 'Ia memeriksa uang di rekening.\n<long pause>\nLalu menutup ponsel.', 'A visual cut inside a sentence must not add a long TTS pause')
  const text = '<short pause> Kenzo menyiram tanaman di depan rumahnya. Tetangganya melirik sambil berjalan menuju tempat kerja. Kenzo kemudian membuka ponsel untuk memeriksa pembayaran dividen bulan ini.'
  for (const opening of [false, true]) {
    const parts = visualShotParts(text, 15000, 'id', opening)
    assert(parts.length >= 3)
    assert.equal(parts.map(p => p.narration).join(''), text, 'All words, punctuation, whitespace and tags must survive')
    assert.equal(parts.reduce((s, p) => s + p.durationMs, 0), 15000)
    assert(parts.every(p => p.durationMs >= 1800 && p.durationMs <= (opening ? 4500 : 7000)))
    for (const part of parts) assert.equal(visualShotParts(part.narration, part.durationMs, 'id', opening).length, 1, 'Retry must not subdivide again')
  }
  const money = 'Ia memeriksa Rp 15 juta yang masuk ke rekening, lalu menyisihkan uang untuk kebutuhan rumah dan menyimpan sisanya untuk bulan berikutnya.'
  const parts = visualShotParts(money, 13000, 'id')
  assert(parts.some(p => p.narration.includes('Rp 15 juta')), 'Currency and scale stay in the same shot')
  assert.equal(parts.map(p => p.narration).join(''), money)
  assert.deepEqual(visualShotParts('Satu kalimat singkat.', 4000, 'id'), [{ narration: 'Satu kalimat singkat.', durationMs: 4000 }])
  assert.equal(visualShotParts('Hening.', 15000, 'id').length, 1, 'Do not invent text to subdivide a sparse passage')
  const clean = { imageAssetId: null, videoAssetId: null, audioAssetId: null, motionType: 'camera', voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0, mediaInMs: 0 }
  assert(canDivideVisual(clean))
  for (const patch of [{ imageAssetId: 'image' }, { videoAssetId: 'video' }, { audioAssetId: 'voice' }, { voiceStartMs: 100 }, { motionType: 'video' }]) assert(!canDivideVisual({ ...clean, ...patch }))
  console.log('VISUAL SHOTS PASS: lossless narration, bounded shot lengths, continuous total duration, retry stability, currency expressions and existing-media protection. ' + dir)
})().catch(error => { console.error(error); process.exitCode = 1 })
