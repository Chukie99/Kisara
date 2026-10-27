import type { ScriptAssessment } from './production'
export type ProjectStatus = 'draft' | 'script' | 'storyboard' | 'editing' | 'exported'
export type AspectRatio = '16:9' | '9:16'
export type TtsProvider = 'gemini' | 'elevenlabs' | 'supertonic' | 'f5-hf' | 'f5-local'
/** Which service draws clip images: Higgsfield (credits), Cloudflare (free quota) or a Hugging Face Space. */
export type ImageProvider = 'higgsfield' | 'cloudflare' | 'huggingface'
export type LlmProvider = 'gemini' | 'openrouter' | 'groq' | 'custom'
export type ApiProvider =
  | 'higgsfield'
  | 'gemini'
  | 'elevenlabs'
  | 'openrouter'
  | 'groq'
  | 'custom'
  | 'cloudflare'
  | 'huggingface'
  | 'freesound'
/** Where a live model list comes from: an LLM provider, or a TTS catalog. */
export type ModelSource = LlmProvider | 'gemini-tts' | 'elevenlabs'
export type MotionType = 'camera' | 'video'
export type CameraPresetId =
  | 'zoomin'
  | 'zoomout'
  | 'panleft'
  | 'panright'
  | 'panup'
  | 'pandown'
  | 'zoomleft'
  | 'zoomright'
  | 'kenburns'
  | 'reveal'
  | 'rotate'
  | 'handheld'
  | 'shake'
  | 'static'
export type MotionStrength = 'halus' | 'sedang' | 'kuat'
export type TransitionId = 'cut' | 'fade' | 'slideleft' | 'slideright' | 'slideup' | 'zoomin' | 'wipeleft' | 'circleopen' | 'blur' | 'squeezev'
export type CaptionStyleId = 'karaoke' | 'tebal' | 'minimal' | 'subtitle' | 'none'
export type CaptionPosition = 'atas' | 'tengah' | 'bawah'
export type CaptionSize = 'kecil' | 'sedang' | 'besar'
/** 1 idea, 2 script, 3 storyboard, 4 editor */
export type Step = 1 | 2 | 3 | 4

export interface ScriptProgress {
  projectId: string
  status: 'running' | 'done' | 'failed' | 'canceled'
  completed: number
  total: number
  message: string
}

export interface EditorSettings {
  scriptAssessment?: ScriptAssessment
  storyBrief?: { idea: string; fictional: boolean; sourceTitle?: string; sourceOptions?: SourceOptions; sourceNotes?: string[]; reviewNotes?: string[]; pacing?: StoryPacing }
  /** Flow export can restyle an existing shot plan without another LLM request or changing the video. */
  flowLook?: 'project' | 'cartoon-indonesia'
  flowMode?: 'image' | 'video'
  captionStyle: CaptionStyleId
  captionPosition: CaptionPosition
  captionSize: CaptionSize
  /** Caption size as a multiple of the style's size (0.5–1.8); overrides captionSize when set. */
  captionScale?: number
  /** Custom look on top of the chosen caption style; unset fields keep the style's own. */
  captionFont?: string
  captionColor?: string
  captionHighlight?: string
  /** Box behind the caption: a color and opacity, or null for no box. */
  captionBg?: { color: string; opacity: number } | null
  musicAssetId: string | null
  musicVolumeDb: number
  duckMusic: boolean
  /** Logos, watermarks and text placed over the video. */
  overlays: Overlay[]
  /** Sound effects placed at their own moments on the timeline. */
  sfx?: SfxOverlay[]
  /** Volume change for all narration, in dB. */
  voiceVolumeDb?: number
  /** Background music on the timeline: from `musicStartMs` to `musicEndMs` (null: the end), `musicInMs` into the song. */
  musicStartMs?: number
  musicEndMs?: number | null
  musicInMs?: number
  /** Last prompt written for making background music in an outside AI (Suno, Udio, …). */
  musicPrompt?: MusicPrompt | null
  soundPlan?: SoundCue[]
  voiceDelivery?: 'natural' | 'dramatic' | 'warm' | 'tense'
  /** Local narration tempo, applied before alignment and scene cuts. */
  narrationSpeed?: number
  autoSound?: boolean
}

export interface SoundCue {
  clipId: string
  label: string
  query: string
  reason: string
}

export interface MusicPrompt {
  /** Suno "Style of Music": comma-separated English tags. */
  style: string
  /** Suno "Exclude styles". */
  exclude: string
  title: string
  /** One paragraph for other music AIs (Udio, ElevenLabs Music, Stable Audio, …). */
  description: string
  /** Why this music fits, in Indonesian, for the user. */
  reason: string
  /** Video length when it was written, in seconds. */
  durationSec: number
}

/**
 * Where an overlay sits: `anchor` is a numpad position on the overlay itself (7 top-left, 5 center,
 * 3 bottom-right, the same numbering as ASS n), and `x`/`y` place that point as a fraction of the frame.
 */
interface OverlayBase {
  id: string
  anchor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  x: number
  y: number
  /** Seconds on the final timeline; `end` null means until the video ends. */
  start: number
  end: number | null
}

export interface ImageOverlay extends OverlayBase {
  kind: 'image'
  assetId: string
  /** Width as a fraction of the frame width. */
  width: number
  opacity: number
}

export type TextOverlayStyle = 'plain' | 'outline' | 'box'

export interface TextOverlay extends OverlayBase {
  kind: 'text'
  text: string
  /** Font size as a fraction of the frame height. */
  size: number
  color: string
  style: TextOverlayStyle
  bold: boolean
}

export type Overlay = ImageOverlay | TextOverlay

/**
 * A sound effect laid on the timeline at its own moment — a siren, crickets, dripping water, a jump scare.
 * It is deliberately separate from the narration and the one background-music track, because effects are
 * placed per moment rather than played across the whole video.
 */
export interface SfxOverlay {
  id: string
  assetId: string
  /** Seconds on the final timeline. */
  start: number
  /** Volume change for this effect, in dB. */
  volumeDb: number
  /** What the sound is, for the editor list. */
  label: string
  clipId?: string
  offsetSec?: number
  source?: 'auto'
}

export interface Project {
  id: string
  title: string
  synopsis: string
  durationSec: number
  language: string
  aspectRatio: AspectRatio
  styleId: string
  ttsProvider: TtsProvider
  ttsVoice: string
  /** Higgsfield endpoint ids; null falls back to the app default. */
  imageModel: string | null
  videoModel: string | null
  /** One of the video model's resolutions, e.g. "720p"; null or unsupported uses the default (1080p when offered). */
  videoResolution: string | null
  status: ProjectStatus
  step: Step
  coverAssetId: string | null
  editor: EditorSettings
  createdAt: number
  updatedAt: number
}

export interface Character {
  id: string
  projectId: string
  name: string
  description: string
  sheetAssetId: string | null
  sort: number
}

export interface Clip {
  id: string
  projectId: string
  sort: number
  title: string
  /** What happens in the scene, in the script's language (the Naskah step). */
  story: string
  visualPrompt: string
  /** The story text the current visual plan was written from; null before any plan. */
  visualSource: string | null
  narration: string
  durationMs: number
  characterIds: string[]
  motionType: MotionType
  cameraPreset: CameraPresetId
  motionStrength: MotionStrength
  videoPrompt: string
  transition: TransitionId
  /** Camera move drawn over the AI video ('static' keeps the video as it is). */
  videoCamera: CameraPresetId
  videoStrength: MotionStrength
  /** Length of the transition into the next clip; null uses the default (0.4 s). */
  transitionMs: number | null
  /** Volume change for this clip's narration, in dB. */
  voiceGainDb: number
  /** Where the clip's video starts, in ms into the video file (trimmed from the left on the timeline). */
  mediaInMs: number
  /** The clip's voice trimmed to `voiceInMs`–`voiceOutMs` of its audio (null: to the end), placed `voiceStartMs` into the clip. */
  voiceInMs: number
  voiceOutMs: number | null
  voiceStartMs: number
  imageAssetId: string | null
  videoAssetId: string | null
  audioAssetId: string | null
}

export type AssetKind = 'image' | 'video' | 'audio' | 'music' | 'sfx' | 'overlay' | 'export'

/** One sound effect found by a search, before it is downloaded into the project. */
export interface SfxHit {
  id: string
  name: string
  /** Length in seconds. */
  duration: number
  /** Who made it, so the user can credit it when the licence asks for that. */
  author: string
  /** Human-readable licence, e.g. "Creative Commons 0". */
  license: string
  /** Direct link to the audio file. */
  url: string
  /** Page on the source site, for the user to check the sound themselves. */
  pageUrl: string
}

export interface WordTiming {
  text: string
  start: number
  end: number
}

export interface AssetMeta {
  words?: WordTiming[]
  estimatedTimings?: boolean
  voice?: string
  [key: string]: unknown
}

export interface Asset {
  id: string
  projectId: string
  clipId: string | null
  characterId: string | null
  kind: AssetKind
  provider: string | null
  model: string | null
  prompt: string | null
  remoteId: string | null
  remoteUrl: string | null
  localPath: string
  url: string
  durationMs: number | null
  width: number | null
  height: number | null
  meta: AssetMeta
  createdAt: number
}

/** "narration" voices several scenes in one take and cuts it per scene. */
export type JobKind = 'story' | 'image' | 'sheet' | 'video' | 'tts' | 'narration' | 'align' | 'sfx' | 'export'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface Job {
  id: string
  projectId: string
  clipId: string | null
  characterId: string | null
  kind: JobKind
  provider: string
  status: JobStatus
  progress: number
  message: string | null
  error: string | null
  resultAssetId: string | null
  createdAt: number
  updatedAt: number
}

export interface ProjectBundle {
  project: Project
  characters: Character[]
  clips: Clip[]
  assets: Asset[]
  jobs: Job[]
}

export interface ProjectSummary {
  id: string
  title: string
  styleId: string
  status: ProjectStatus
  step: Step
  clipCount: number
  totalMs: number
  coverUrl: string | null
  updatedAt: number
}

/** What the renderer sends on save. Asset links are owned by the main process and never overwritten by a save. */
export interface ProjectSnapshot {
  project: Omit<Project, 'createdAt' | 'updatedAt' | 'coverAssetId'>
  characters: Omit<Character, 'sheetAssetId'>[]
  clips: Omit<Clip, 'imageAssetId' | 'videoAssetId' | 'audioAssetId'>[]
}

export interface NewProjectInput {
  title?: string
  storyBrief?: EditorSettings['storyBrief']
  synopsis?: string
  durationSec?: number
  language?: string
  aspectRatio?: AspectRatio
  styleId?: string
  ttsProvider?: TtsProvider
}

export interface KeyStatus {
  provider: ApiProvider
  configured: boolean
  lastOk: boolean | null
  lastMessage: string | null
  checkedAt: number | null
  /** Masked key for display, e.g. "sk-or-v1…9f3c". Null when there is no readable key. */
  preview: string | null
  /** A key is stored but can no longer be decrypted and must be entered again. */
  unreadable: boolean
}

export interface KeyTestResult {
  ok: boolean
  message: string
}

export interface VoiceOption {
  id: string
  name: string
  description: string
  previewUrl?: string | null
}

/**
 * An editorial idea and synopsis from source material, in factual or fictional mode.
 * Source notes retain provenance for review; they are not independently verified facts.
 */
export interface StoryPacing {
  synopsis: string
  idea: string
  partial: boolean
  reason: string
  beats: { event: string; seconds: number }[]
}

export interface SourceOptions {
  mode: 'factual' | 'fiction'
  audience: string
  angle: string
  contribution: string
}

export interface VideoIdea {
  fictional?: boolean
  sourceOptions?: SourceOptions
  sourceNotes?: string[]
  reviewNotes?: string[]
  pacing?: StoryPacing
  idea: string
  renamedCharacters?: { original: string; replacement: string }[]
  title: string
  synopsis: string
  /** The source video's own title, shown to the user so they can check what was read. */
  videoTitle: string
  uploader: string
  durationSec: number
  /** How many characters of the spoken transcript were read. */
  transcriptChars: number
  /** How many parts the transcript was read in; 1 when it fitted in a single pass. */
  chunks: number
  /** "captions" came from YouTube; "whisper" was transcribed locally from the audio. */
  transcriptSource: 'captions' | 'whisper' | 'text'
  /** True when only the opening minutes exist, because a caption-less video was transcribed locally. */
  partial: boolean
}

export interface AppSettings {
  defaultTtsProvider: TtsProvider
  defaultLanguage: string
  exportFolder: string | null
  /** Which LLM writes stories and narration. */
  llmProvider: LlmProvider
  /** Chosen model per LLM provider, so switching providers keeps each choice. */
  llmModels: Record<LlmProvider, string>
  /** Base URL of an OpenAI-compatible endpoint, e.g. http://localhost:11434/v1 */
  customBaseUrl: string
  geminiTtsModel: string
  elevenModel: string
  /** Folder of the local Supertonic studio: holds a compatible bridge and the `.venv` Python. No key needed. */
  supertonicDir: string
  /** Supertonic delivery preset for narration: dark_documentary, cinematic_mystery or horror_thriller. */
  supertonicPreset: string
  /** F5 Gradio Space and named endpoint, independent from the image Space. */
  f5Space: string
  f5Endpoint: string
  f5RefText: string
  /** Owned WAV basename; the original user file is never moved. */
  f5Reference: string
  f5ReferenceName: string
  /** Changes whenever the reference or synthesis configuration changes. */
  f5VoiceId: string
  /** Loopback API of the user's F5 Indo Studio; references stay in that studio. */
  f5LocalUrl: string
  /** Higgsfield models for new projects: the last ones picked in the Idea step. */
  imageModel: string
  videoModel: string
  /** Which service draws clip images. Cloudflare Workers AI has a free daily quota and needs no credits. */
  imageProvider: ImageProvider
  /** Cloudflare account id: the REST endpoint is per-account. */
  cloudflareAccountId: string
  /** Cloudflare text-to-image model id. */
  cloudflareModel: string
  /** The user's own Hugging Face Space that draws the pictures, as "owner/space-name". */
  hfSpace: string
  /** How roomy the interface is: 'padat' fits more on screen by tightening every gap. */
  density: 'nyaman' | 'padat'
  /** Time captions against the real voice with Whisper after narration is made (when the model is present). */
  whisperAuto: boolean
}

/** What one Higgsfield request would cost, from the API's estimate endpoint. */
export interface CreditEstimate {
  credits: number
  usd: number | null
}

/** The local Whisper model used to time caption words. */
export interface WhisperStatus {
  state: 'missing' | 'downloading' | 'verifying' | 'ready'
  received: number
  total: number
  error: string | null
}

export interface ModelOption {
  id: string
  name: string
  description?: string
  contextLength?: number | null
  /** USD per 1M input / output tokens, when the provider publishes it. */
  priceIn?: number | null
  priceOut?: number | null
  /** Short labels the picker can filter on, e.g. "JSON", "Gratis", "Gambar". */
  tags: string[]
  /** Model family, e.g. "Kling", for a brand mark next to the name. */
  family?: string
  /** Higgsfield credits (and dollars) for one request; undefined while unknown, null when it cannot be estimated. */
  credits?: number | null
  usd?: number | null
  /** What the credits pay for, e.g. "10 dtk". */
  creditUnit?: string
}

export interface ModelList {
  models: ModelOption[]
  fetchedAt: number
}

export interface ExportOptions {
  fileName: string
  resolution: 720 | 1080 | 2160
  fps: 30 | 60
  burnCaptions: boolean
  writeSrt: boolean
  normalizeAudio: boolean
  duckMusic: boolean
  folder: string
}

export interface ClipPatchEvent {
  clipId: string
  patch: Partial<Clip>
}

export interface CharacterPatchEvent {
  characterId: string
  patch: Partial<Character>
}

export interface FlowExportOptions {
  kind?: 'guide' | 'narration' | 'agent' | 'mapping'
  batchIndex?: number
}
