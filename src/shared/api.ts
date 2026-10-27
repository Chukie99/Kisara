import type { ScriptAssessment, MediaImportPlan, MediaImportChoice } from './production'
import type {
  ApiProvider,
  AspectRatio,
  AppSettings,
  Asset,
  CharacterPatchEvent,
  ClipPatchEvent,
  CreditEstimate,
  WhisperStatus,
  WordTiming,
  ExportOptions,
  EditorSettings,
  SfxOverlay,
  Job,
  KeyStatus,
  KeyTestResult,
  ModelList,
  ModelSource,
  MusicPrompt,
  NewProjectInput,
  ProjectBundle,
  ProjectSnapshot,
  ProjectSummary,
  SfxHit,
  SoundCue,
  ScriptProgress,
  FlowExportOptions,
  TtsProvider,
  SourceOptions,
  VideoIdea,
  VoiceOption
} from './types'

/** The typed surface the preload script exposes as `window.api`. */
export interface StudioApi {
  projects: {
    list(): Promise<ProjectSummary[]>
    create(input: NewProjectInput): Promise<ProjectBundle>
    get(id: string): Promise<ProjectBundle>
    save(snapshot: ProjectSnapshot): Promise<{ updatedAt: number }>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<ProjectSummary>
  }
  story: {
    reviewScript(projectId: string): Promise<ScriptAssessment>
    visualStatus(projectId: string): Promise<ScriptProgress | null>
    cancelVisuals(projectId: string): Promise<void>
    scriptStatus(projectId: string): Promise<ScriptProgress | null>
    cancelScript(projectId: string): Promise<void>
    exportFlow(projectId: string, format: 'txt' | 'docx', options?: FlowExportOptions): Promise<string | null>
    refineScript(projectId: string): Promise<ProjectBundle>
    soundPlan(projectId: string): Promise<SoundCue[]>
    /** Idea → scene-by-scene script (story and voice-over). */
    script(projectId: string): Promise<ProjectBundle>
    /** One fresh, clickable topic for a category, for the idea box on the home screen. */
    idea(category: string, language: string): Promise<{ title: string; synopsis: string }>
    /** Reads source material into the selected factual or fictional editorial brief. */
    fromVideo(url: string, language: string, options?: SourceOptions): Promise<VideoIdea>
    /** Whether the yt-dlp used to read a video is already available on this computer. */
    youtubeStatus(): Promise<{ ready: boolean; version: string | null; path: string | null }>
    /** Script → one image plan per scene; "missing" skips scenes whose plan still matches their story. */
    visuals(projectId: string, mode: 'missing' | 'all'): Promise<ProjectBundle>
    /** A background-music prompt that fits the finished script, for use in Suno or another music AI. */
    musicPrompt(projectId: string): Promise<MusicPrompt>
    /** Writes every clip's image prompt to a JSON file, for drawing the pictures somewhere else. Returns the path. */
    exportPrompts(projectId: string): Promise<string | null>
  }
  generate: {
    clipImage(clipId: string): Promise<Job>
    /** Runs script, visual plans, pictures, voice and captions one after another, waiting for each step. */
    pipeline(projectId: string): Promise<ProjectBundle>
    clipVideo(clipId: string): Promise<Job>
    clipTts(clipId: string): Promise<Job>
    characterSheet(characterId: string): Promise<Job>
    /** Every picture the project still needs; with 'all' every picture is drawn again, e.g. after a style change. */
    missingImages(projectId: string, mode?: 'missing' | 'all'): Promise<Job[]>
    /** An AI video for every clip that has an image but no video yet. */
    missingVideos(projectId: string): Promise<Job[]>
    missingTts(projectId: string): Promise<Job[]>
    /** Voices scenes in one continuous take and cuts it per scene: those without a voice, or all of them. */
    narration(projectId: string, mode: 'missing' | 'all'): Promise<Job>
    /** Re-times caption words of voiced scenes against the audio with the local Whisper model. */
    syncCaptions(projectId: string, mode?: 'stale' | 'all'): Promise<Job>
    cancel(jobId: string): Promise<void>
    /** Credits for one image, or one video of about `seconds`, with this model. Null without a working key. */
    estimate(kind: 'image' | 'video', modelId: string, aspect: AspectRatio, seconds?: number, resolution?: string | null): Promise<CreditEstimate | null>
  }
  clips: {
    /** Splits a clip at `atMs` into two clips (picture, voice and narration divided at the nearest pause). */
    split(clipId: string, atMs: number): Promise<ProjectBundle>
    /** Takes the voice off a clip. */
    detachVoice(clipId: string): Promise<void>
  }
  assets: {
    prepareMediaImport(projectId: string): Promise<MediaImportPlan | null>
    applyMediaImport(projectId: string, token: string, choices: MediaImportChoice[], replaceExisting: boolean): Promise<{ imported: number; skipped: number }>
    discardMediaImport(token: string): Promise<void>
    setActive(clipId: string, assetId: string): Promise<void>
    /** Caption words of a voice clip, after the text was fixed by hand. */
    setWords(assetId: string, words: WordTiming[]): Promise<Asset>
    pickMusic(projectId: string): Promise<Asset | null>
    /** A logo or watermark image for an overlay. */
    pickImage(projectId: string): Promise<Asset | null>
    /** A video file from disk, used as a clip's picture instead of an AI video. */
    pickVideo(projectId: string, clipId: string | null): Promise<Asset | null>
    /** An image file from disk, used as a clip's picture instead of an AI image. */
    pickClipImage(projectId: string, clipId: string | null): Promise<Asset | null>
  }
  sfx: {
    auto(projectId: string): Promise<Job>
    /** Searches the sound-effect library for a phrase such as "siren" or "crickets". */
    search(query: string, limit?: number): Promise<SfxHit[]>
    /** Downloads a search hit into the project and returns the stored asset. */
    add(projectId: string, hit: SfxHit): Promise<Asset>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    keys(): Promise<KeyStatus[]>
    setKey(provider: ApiProvider, key: string): Promise<KeyTestResult>
    /** Saves an OpenAI-compatible endpoint; the key is optional for local servers. */
    setCustom(baseUrl: string, key: string): Promise<KeyTestResult>
    clearKey(provider: ApiProvider): Promise<void>
    /** The full stored key, only for the "show key" button. */
    revealKey(provider: ApiProvider): Promise<string | null>
    /** Cloudflare stores an account id beside its token, so both are saved and checked together. */
    setCloudflare(accountId: string, key: string): Promise<KeyTestResult>
    /** A Hugging Face Space is named beside its optional token, so both are saved and checked together. */
    setHuggingFace(space: string, key: string): Promise<KeyTestResult>
    testKey(provider: ApiProvider): Promise<KeyTestResult>
    /** Sends only a fixed short fictional prompt to the selected writer. */
    testWriter(): Promise<KeyTestResult>
    voices(provider: TtsProvider): Promise<VoiceOption[]>
    /** Whether the local Supertonic studio is usable; it needs a folder, not a key. */
    supertonicStatus(): Promise<KeyTestResult>
    setF5(input: { space: string; endpoint: string; refText: string; token?: string }): Promise<AppSettings>
    pickF5Reference(): Promise<AppSettings | null>
    testF5(): Promise<KeyTestResult>
    testF5Local(baseUrl?: string): Promise<KeyTestResult>
    /** Picks the Supertonic folder: settings when one was chosen, null when cancelled. */
    pickSupertonicDir(): Promise<AppSettings | null>
  }
  models: {
    /** Live model list from the provider. Served from cache unless `refresh` is set or the cache is stale. */
    list(source: ModelSource, refresh?: boolean): Promise<ModelList>
  }
  exporter: {
    start(projectId: string, options: ExportOptions): Promise<Job>
    defaultFolder(): Promise<string>
    pickFolder(): Promise<string | null>
    reveal(path: string): Promise<void>
  }
  app: {
    openExternal(url: string): Promise<void>
    copyText(text: string): Promise<void>
    version(): Promise<string>
  }
  whisper: {
    status(): Promise<WhisperStatus>
    download(): Promise<void>
    cancel(): Promise<void>
    remove(): Promise<void>
    openFolder(): Promise<void>
  }
  on: {
    visualProgress(cb: (progress: ScriptProgress) => void): () => void
    scriptProgress(cb: (progress: ScriptProgress) => void): () => void
    production(cb: (bundle: ProjectBundle) => void): () => void
    editor(cb: (e: { projectId: string; patch: Partial<EditorSettings>; sfxAdded?: SfxOverlay[] }) => void): () => void
    whisper(cb: (status: WhisperStatus) => void): () => void
    job(cb: (job: Job) => void): () => void
    clip(cb: (e: ClipPatchEvent) => void): () => void
    character(cb: (e: CharacterPatchEvent) => void): () => void
    asset(cb: (asset: Asset) => void): () => void
  }
}

export const EVENTS = {
  visualProgress: 'event:visual-progress',
  scriptProgress: 'event:script-progress',
  production: 'event:production',
  editor: 'event:editor',
  job: 'event:job',
  clip: 'event:clip',
  character: 'event:character',
  asset: 'event:asset',
  whisper: 'event:whisper'
} as const
