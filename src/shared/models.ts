import { NARRATION_WPS } from './script'
import type { LlmProvider, TtsProvider } from './types'

export const LLM_PROVIDERS: { id: LlmProvider; name: string; note: string; link: string | null; linkLabel: string }[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    note: 'Kunci ini juga dipakai untuk suara narator Gemini TTS.',
    link: 'https://aistudio.google.com/apikey',
    linkLabel: 'Buat kunci di Google AI Studio'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    note: 'Satu kunci untuk ratusan model dari banyak penyedia, termasuk model gratis.',
    link: 'https://openrouter.ai/settings/keys',
    linkLabel: 'Buat kunci di OpenRouter'
  },
  {
    id: 'groq',
    name: 'Groq',
    note: 'Inferensi sangat cepat untuk model open-source seperti Llama, Qwen, dan GPT-OSS.',
    link: 'https://console.groq.com/keys',
    linkLabel: 'Buat kunci di console Groq'
  },
  {
    id: 'custom',
    name: 'Endpoint custom',
    note: 'Server apa pun yang kompatibel dengan OpenAI API, misalnya Ollama, LM Studio, vLLM, DeepSeek, atau xAI Grok.',
    link: null,
    linkLabel: ''
  }
]

export function llmName(id: LlmProvider): string {
  return LLM_PROVIDERS.find((p) => p.id === id)?.name ?? id
}

/** First voice a project uses when a narrator service is picked: Gemini names one, Supertonic ships M1–F5. */
export function defaultVoiceFor(provider: TtsProvider): string {
  return provider === 'gemini' ? 'Charon' : provider === 'supertonic' ? 'M2' : ''
}

/** Delivery presets of the local Supertonic studio, matching its own `horror_narrator.PRESETS`. */
export const SUPER_PRESETS: { id: string; name: string; note: string }[] = [
  { id: 'dark_documentary', name: 'Dokumenter gelap', note: 'Tenang dan berat, tempo hampir datar' },
  { id: 'cinematic_mystery', name: 'Misteri sinematik', note: 'Jeda lebih panjang, sedikit lebih pelan' },
  { id: 'horror_thriller', name: 'Thriller horor', note: 'Paling lambat, jeda dramatis paling tebal' }
]

/**
 * Cloudflare Workers AI text-to-image models that fit inside the free daily quota.
 * SDXL comes first because the Flux models on Workers AI reject innocent prompts as NSFW
 * (cloudflare/developer-platform#58); that filter cannot be turned off.
 */
export const CLOUDFLARE_IMAGE_MODELS: { id: string; name: string; note: string }[] = [
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', note: 'Disarankan · ikut rasio video (16:9 / 9:16), filternya normal' },
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 schnell', note: 'Hasil lebih bagus, tapi kotak dan filternya sering salah tolak prompt biasa' }
]

/** Higgsfield image and video models live in ./higgsfield.ts, generated from the API docs. */

/**
 * Gemini 3.8 TTS Voice Library voices that ship with a sample in the app (assets/voices/<id>.mp3). Used
 * when the live voice list cannot be fetched; the tone comes from each sample's persona.
 */
export const GEMINI_LIBRARY_VOICES: { id: string; name: string; tone: string }[] = [
  { id: 'en-us-arlo', name: 'Arlo', tone: 'asisten pribadi' },
  { id: 'en-us-bodi', name: 'Bodi', tone: 'pengajar sastra' },
  { id: 'en-us-brio', name: 'Brio', tone: 'pembaca berita bisnis' },
  { id: 'en-us-cruz', name: 'Cruz', tone: 'penasihat keuangan' },
  { id: 'en-us-daro', name: 'Daro', tone: 'layanan pelanggan, empatik' },
  { id: 'en-us-elio', name: 'Elio', tone: 'formal, resmi' },
  { id: 'en-us-enya', name: 'Enya', tone: 'pemandu teknis' },
  { id: 'en-us-enzo', name: 'Enzo', tone: 'pencerita petualangan' },
  { id: 'en-us-finn', name: 'Finn', tone: 'asisten pribadi' },
  { id: 'en-us-fola', name: 'Fola', tone: 'layanan pelanggan' },
  { id: 'en-us-gero', name: 'Gero', tone: 'hangat, menenangkan' },
  { id: 'en-us-hali', name: 'Hali', tone: 'layanan pelanggan' },
  { id: 'en-us-jett', name: 'Jett', tone: 'pemandu teknis' },
  { id: 'en-us-lora', name: 'Lora', tone: 'concierge elegan' },
  { id: 'en-us-ludo', name: 'Ludo', tone: 'pengajar teknologi' },
  { id: 'en-us-lumi', name: 'Lumi', tone: 'pengajar sastra' },
  { id: 'en-us-mako', name: 'Mako', tone: 'presentasi produk' },
  { id: 'en-us-neno', name: 'Neno', tone: 'lembut, pendengar' },
  { id: 'en-us-nika', name: 'Nika', tone: 'lembut, pendengar' },
  { id: 'en-us-nyla', name: 'Nyla', tone: 'pemandu teknis' },
  { id: 'en-us-rami', name: 'Rami', tone: 'pembaca berita' },
  { id: 'en-us-riko', name: 'Riko', tone: 'pencerita fantasi' },
  { id: 'en-us-rina', name: 'Rina', tone: 'hangat, menenangkan' },
  { id: 'en-us-tari', name: 'Tari', tone: 'tenang, menenangkan' },
  { id: 'en-us-tavi', name: 'Tavi', tone: 'concierge elegan' },
  { id: 'en-us-tova', name: 'Tova', tone: 'formal, resmi' },
  { id: 'en-us-varo', name: 'Varo', tone: 'pengajar matematika' },
  { id: 'en-us-veda', name: 'Veda', tone: 'pembaca berita' },
  { id: 'en-us-zali', name: 'Zali', tone: 'dramatis, fantasi gelap' },
  { id: 'en-us-zeno', name: 'Zeno', tone: 'pembawa acara' }
]

/** Tone of any Gemini voice we know, by id. */
export function geminiVoiceTone(id: string): string | undefined {
  return GEMINI_LIBRARY_VOICES.find((v) => v.id === id)?.tone ?? GEMINI_VOICES.find((v) => v.id === id)?.tone
}

export function geminiVoiceName(id: string): string {
  return GEMINI_LIBRARY_VOICES.find((v) => v.id === id)?.name ?? id
}

/** The 30 classic prebuilt voices. */
export const GEMINI_VOICES: { id: string; tone: string }[] = [
  { id: 'Charon', tone: 'informatif' },
  { id: 'Kore', tone: 'tegas' },
  { id: 'Puck', tone: 'ceria' },
  { id: 'Zephyr', tone: 'cerah' },
  { id: 'Fenrir', tone: 'bersemangat' },
  { id: 'Leda', tone: 'muda' },
  { id: 'Orus', tone: 'tegas' },
  { id: 'Aoede', tone: 'santai' },
  { id: 'Callirrhoe', tone: 'santai' },
  { id: 'Autonoe', tone: 'cerah' },
  { id: 'Enceladus', tone: 'berbisik' },
  { id: 'Iapetus', tone: 'jernih' },
  { id: 'Umbriel', tone: 'santai' },
  { id: 'Algieba', tone: 'halus' },
  { id: 'Despina', tone: 'halus' },
  { id: 'Erinome', tone: 'jernih' },
  { id: 'Algenib', tone: 'serak' },
  { id: 'Rasalgethi', tone: 'informatif' },
  { id: 'Laomedeia', tone: 'ceria' },
  { id: 'Achernar', tone: 'lembut' },
  { id: 'Alnilam', tone: 'tegas' },
  { id: 'Schedar', tone: 'stabil' },
  { id: 'Gacrux', tone: 'dewasa' },
  { id: 'Pulcherrima', tone: 'lugas' },
  { id: 'Achird', tone: 'ramah' },
  { id: 'Zubenelgenubi', tone: 'kasual' },
  { id: 'Vindemiatrix', tone: 'lembut' },
  { id: 'Sadachbia', tone: 'hidup' },
  { id: 'Sadaltager', tone: 'berwawasan' },
  { id: 'Sulafat', tone: 'hangat' }
]

export const LANGUAGES: { code: string; label: string; english: string }[] = [
  { code: 'id', label: 'Indonesia', english: 'Indonesian' },
  { code: 'en', label: 'English', english: 'English' },
  { code: 'ms', label: 'Melayu', english: 'Malay' },
  { code: 'jv', label: 'Jawa', english: 'Javanese' },
  { code: 'su', label: 'Sunda', english: 'Sundanese' },
  { code: 'es', label: 'Español', english: 'Spanish' },
  { code: 'ar', label: 'العربية', english: 'Arabic' }
]

export const DURATIONS: { sec: number; label: string }[] = [
  { sec: 30, label: '30 detik' },
  { sec: 60, label: '1 menit' },
  { sec: 180, label: '3 menit' },
  { sec: 300, label: '5 menit' },
  { sec: 600, label: '10 menit' }
]

/**
 * How many words per second each narrator service actually speaks, taken from real takes. The local
 * Supertonic studio narrates slowly and deliberately, so its clips hold far fewer words per second than a
 * cloud voice, and every duration estimate has to know that.
 */
export const TTS_WORDS_PER_SECOND: Record<TtsProvider, number> = {
  'f5-local': 2,
  'f5-hf': 2,
  gemini: NARRATION_WPS,
  elevenlabs: NARRATION_WPS,
  supertonic: 1.8
}

/**
 * Words per second of actual speech, with the breath between lines left out. The rate above counts that
 * breath, so it is the right number for estimating how long a line will take but the wrong one for deciding
 * how many words fit in a few seconds once the pauses have been trimmed.
 */
export const TTS_SPEECH_WPS: Record<TtsProvider, number> = {
  'f5-local': 2.5,
  'f5-hf': 2.5,
  gemini: 3,
  elevenlabs: 3,
  supertonic: 2.5
}

/** Topic buckets the idea generator draws from, chosen for the niches this app is used for. */
export const IDEA_TOPICS: { id: string; label: string; note: string }[] = [
  { id: 'sejarah', label: 'Sejarah', note: 'Peristiwa, tokoh, kerajaan' },
  { id: 'misteri', label: 'Misteri', note: 'Yang belum terpecahkan' },
  { id: 'horor', label: 'Horor', note: 'Kisah seram dan legenda' },
  { id: 'fakta', label: 'Fakta unik', note: 'Hal yang bikin kaget' },
  { id: 'sains', label: 'Sains', note: 'Alam, teknologi, angkasa' },
  { id: 'bisnis', label: 'Bisnis', note: 'Kisah sukses dan gagal' },
  { id: 'tokoh', label: 'Tokoh', note: 'Kisah hidup seseorang' },
  { id: 'mitos', label: 'Mitos', note: 'Kepercayaan dan asal-usulnya' }
]

/**
 * How long one picture may stay on screen before a video starts to feel static. Shorts need fast cuts —
 * viewers decide within seconds whether to keep watching — while a longer video can hold a shot for longer
 * without feeling still. A 30 second short becomes eight pictures instead of the four it used to.
 */
export function targetClipSec(durationSec: number): number {
  if (durationSec <= 60) return 3.6
  if (durationSec <= 180) return 5
  return 7
}

/** One clip every few seconds of narration, so the picture never sits still for long. */
export function clipCountFor(durationSec: number): number {
  return Math.max(4, Math.min(160, Math.round(durationSec / targetClipSec(durationSec))))
}
