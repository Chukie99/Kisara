import { create } from 'zustand'
import type { Asset, Character, Clip, Job, Project, ProjectBundle, ProjectSnapshot, WordTiming } from '@shared/types'
import { errorText } from '../lib/format'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

interface ProjectState {
  loaded: boolean
  project: Project | null
  characters: Character[]
  clips: Clip[]
  assets: Record<string, Asset>
  jobs: Record<string, Job>
  saveState: SaveState
  saveError: string | null
  savedAt: number | null
  selectedClipId: string | null

  load(bundle: ProjectBundle): void
  unload(): void
  select(clipId: string | null): void
  updateProject(patch: Partial<Project>): void
  updateEditor(patch: Partial<Project['editor']>): void
  updateClip(id: string, patch: Partial<Clip>): void
  updateCharacter(id: string, patch: Partial<Character>): void
  addClip(afterId: string | null): string
  removeClip(id: string): void
  moveClip(id: string, dir: -1 | 1): void
  addCharacter(init?: { name: string; description: string }): string
  removeCharacter(id: string): void
  save(): Promise<void>
  flush(): Promise<void>

  applyClip(clipId: string, patch: Partial<Clip>): void
  applyCharacter(characterId: string, patch: Partial<Character>): void
  addAsset(asset: Asset): void
  upsertJob(job: Job): void
}

const AUTOSAVE_MS = 1200
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null
let changedDuringSave = false
let loadVersion = 0

function snapshot(s: ProjectState): ProjectSnapshot {
  const { createdAt: _c, updatedAt: _u, coverAssetId: _cv, ...project } = s.project!
  return {
    project,
    characters: s.characters.map(({ sheetAssetId: _s, ...c }) => c),
    clips: s.clips.map(({ imageAssetId: _i, videoAssetId: _v, audioAssetId: _a, ...c }) => c)
  }
}

const newId = (): string => crypto.randomUUID()

/** One step in the editor's history: the whole editor as it was before the change. */
export interface HistoryEntry {
  label: string
  project: Project
  characters: Character[]
  clips: Clip[]
  /** Caption words live on the voice assets, not on the clips, so undo has to carry them too. */
  words: Record<string, WordTiming[]>
  selectedClipId: string | null
}

const HISTORY_LIMIT = 60
const COALESCE_MS = 700
let undoStack: HistoryEntry[] = []
let redoStack: HistoryEntry[] = []
let lastRecord: { key: string; at: number } | null = null
let restoring = false

function captureEntry(label: string): HistoryEntry | null {
  const s = useProject.getState()
  if (!s.project) return null
  const words: Record<string, WordTiming[]> = {}
  for (const a of Object.values(s.assets)) {
    if (a.kind === 'audio' && a.meta.words) words[a.id] = [...a.meta.words]
  }
  return {
    label,
    project: s.project,
    characters: s.characters,
    clips: s.clips,
    words,
    selectedClipId: s.selectedClipId
  }
}

interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  undo(): Promise<void>
  redo(): Promise<void>
  clear(): void
}

export const useHistory = create<HistoryState>(() => ({
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  undo: async () => {
    if (restoring) return
    const entry = undoStack.pop()
    if (!entry) return
    const current = captureEntry(entry.label)
    if (current) redoStack.push(current)
    lastRecord = null
    publishHistory()
    await applyEntry(entry)
  },
  redo: async () => {
    if (restoring) return
    const entry = redoStack.pop()
    if (!entry) return
    const current = captureEntry(entry.label)
    if (current) undoStack.push(current)
    lastRecord = null
    publishHistory()
    await applyEntry(entry)
  },
  clear: () => clearHistory()
}))

function publishHistory(): void {
  useHistory.setState({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack.at(-1)?.label ?? null,
    redoLabel: redoStack.at(-1)?.label ?? null
  })
}

export function clearHistory(): void {
  undoStack = []
  redoStack = []
  lastRecord = null
  publishHistory()
}

/**
 * Remembers the editor before a change. Repeated changes with the same `key` (a slider or a drag) are
 * one step, so dragging a trim handle is undone in one go rather than one pixel at a time.
 */
export function recordHistory(label: string, key?: string): void {
  if (restoring) return
  const now = Date.now()
  if (key && lastRecord && lastRecord.key === key && now - lastRecord.at < COALESCE_MS) {
    lastRecord.at = now
    return
  }
  const entry = captureEntry(label)
  if (!entry) return
  undoStack.push(entry)
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack = []
  lastRecord = { key: key ?? `${label}:${Math.random()}`, at: now }
  publishHistory()
}

/** Puts the editor back and writes it to SQLite, including the links and words a normal save skips. */
async function applyEntry(entry: HistoryEntry): Promise<void> {
  const state = useProject.getState()
  if (!state.project) return
  restoring = true
  loadVersion++
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    // An older autosave must not land after the restored state.
    if (inFlight) await inFlight.catch(() => {})
    const assets = { ...state.assets }
    for (const [id, words] of Object.entries(entry.words)) {
      const asset = assets[id]
      if (asset) assets[id] = { ...asset, meta: { ...asset.meta, words } }
    }
    useProject.setState({
      project: entry.project,
      characters: entry.characters,
      clips: entry.clips,
      assets,
      selectedClipId: entry.selectedClipId,
      saveState: 'saving',
      saveError: null
    })
    const { createdAt: _c, updatedAt: _u, coverAssetId: _cv, ...project } = entry.project
    const { updatedAt } = await window.api.projects.restore({
      project,
      characters: entry.characters,
      clips: entry.clips,
      words: entry.words
    })
    useProject.setState({ saveState: 'saved', savedAt: updatedAt, saveError: null })
  } catch (e) {
    useProject.setState({ saveState: 'error', saveError: errorText(e) })
  } finally {
    restoring = false
  }
}

export const useProject = create<ProjectState>((set, get) => {
  const touch = (): void => {
    if (get().saveState === 'saving') changedDuringSave = true
    set({ saveState: get().saveState === 'saving' ? 'saving' : 'dirty' })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void get().save(), AUTOSAVE_MS)
  }
  const resort = (clips: Clip[]): Clip[] => clips.map((c, i) => ({ ...c, sort: i }))

  return {
    loaded: false,
    project: null,
    characters: [],
    clips: [],
    assets: {},
    jobs: {},
    saveState: 'saved',
    saveError: null,
    savedAt: null,
    selectedClipId: null,

    load: (b) => {
      loadVersion++
      if (timer) { clearTimeout(timer); timer = null }
      changedDuringSave = false
      // A split or an AI job reloads the same project: its history stays. Another project starts clean.
      const previous = get().project?.id
      if (previous && previous !== b.project.id) clearHistory()
      set({
        loaded: true,
        project: b.project,
        characters: b.characters,
        clips: b.clips,
        assets: Object.fromEntries(b.assets.map((a) => [a.id, a])),
        jobs: Object.fromEntries(b.jobs.map((j) => [j.id, j])),
        saveState: 'saved',
        saveError: null,
        savedAt: b.project.updatedAt,
        selectedClipId: get().selectedClipId && b.clips.some((c) => c.id === get().selectedClipId) ? get().selectedClipId : (b.clips[0]?.id ?? null)
      })
    },
    unload: () => {
      loadVersion++
      if (timer) clearTimeout(timer)
      clearHistory()
      set({ loaded: false, project: null, characters: [], clips: [], assets: {}, jobs: {}, selectedClipId: null, saveState: 'saved' })
    },
    select: (clipId) => set({ selectedClipId: clipId }),

    updateProject: (patch) => {
      recordHistory('Ubah proyek', `project:${Object.keys(patch).sort().join(',')}`)
      set({ project: { ...get().project!, ...patch } })
      touch()
    },
    updateEditor: (patch) => {
      recordHistory('Ubah pengaturan', `editor:${Object.keys(patch).sort().join(',')}`)
      const p = get().project!
      set({ project: { ...p, editor: { ...p.editor, ...patch } } })
      touch()
    },
    updateClip: (id, patch) => {
      recordHistory('Ubah klip', `clip:${id}:${Object.keys(patch).sort().join(',')}`)
      set({ clips: get().clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
      touch()
    },
    updateCharacter: (id, patch) => {
      recordHistory('Ubah pemeran', `character:${id}:${Object.keys(patch).sort().join(',')}`)
      set({ characters: get().characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
      touch()
    },
    addClip: (afterId) => {
      recordHistory('Tambah klip')
      const p = get().project!
      const clips = [...get().clips]
      const at = afterId ? clips.findIndex((c) => c.id === afterId) + 1 : clips.length
      const clip: Clip = {
        id: newId(),
        projectId: p.id,
        sort: at,
        title: 'Adegan baru',
        story: '',
        visualPrompt: '',
        visualSource: null,
        narration: '',
        durationMs: 5000,
        characterIds: [],
        motionType: 'camera',
        cameraPreset: 'zoomin',
        motionStrength: 'halus',
        videoPrompt: '',
        transition: 'fade',
        videoCamera: 'static',
        videoStrength: 'halus',
        transitionMs: null,
        voiceGainDb: 0,
        voiceFadeInMs: 0,
        voiceFadeOutMs: 0,
        lookBrightness: 0,
        lookContrast: 0,
        lookSaturation: 0,
        lookHue: 0,
        mediaInMs: 0,
        voiceInMs: 0,
        voiceOutMs: null,
        voiceStartMs: 0,
        imageAssetId: null,
        videoAssetId: null,
        audioAssetId: null
      }
      clips.splice(at, 0, clip)
      set({ clips: resort(clips), selectedClipId: clip.id })
      touch()
      return clip.id
    },
    removeClip: (id) => {
      recordHistory('Hapus klip')
      const clips = get().clips
      const i = clips.findIndex((c) => c.id === id)
      const rest = resort(clips.filter((c) => c.id !== id))
      set({ clips: rest, selectedClipId: rest[Math.min(i, rest.length - 1)]?.id ?? null })
      touch()
    },
    moveClip: (id, dir) => {
      recordHistory('Geser urutan klip')
      const clips = [...get().clips]
      const i = clips.findIndex((c) => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= clips.length) return
      ;[clips[i], clips[j]] = [clips[j], clips[i]]
      set({ clips: resort(clips) })
      touch()
    },
    addCharacter: (init) => {
      recordHistory('Tambah pemeran')
      const p = get().project!
      const c: Character = {
        id: newId(),
        projectId: p.id,
        name: init?.name.trim() || 'Pemeran baru',
        description: init?.description.trim() ?? '',
        sheetAssetId: null,
        sort: get().characters.length
      }
      set({ characters: [...get().characters, c] })
      touch()
      return c.id
    },
    removeCharacter: (id) => {
      recordHistory('Hapus pemeran')
      set({
        characters: get().characters.filter((c) => c.id !== id),
        clips: get().clips.map((c) => ({ ...c, characterIds: c.characterIds.filter((x) => x !== id) }))
      })
      touch()
    },

    save: async () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!get().project) return
      if (inFlight) {
        changedDuringSave = true
        return inFlight
      }
      if (get().saveState === 'saved') return
      changedDuringSave = false
      const savingId = get().project!.id
      const savingVersion = loadVersion
      set({ saveState: 'saving', saveError: null })
      inFlight = (async () => {
        try {
          const { updatedAt } = await window.api.projects.save(snapshot(get()))
          if (get().project?.id === savingId && loadVersion === savingVersion) set({ savedAt: updatedAt, saveState: changedDuringSave ? 'dirty' : 'saved' })
        } catch (e) {
          if (get().project?.id === savingId && loadVersion === savingVersion) set({ saveState: 'error', saveError: errorText(e) })
        } finally {
          inFlight = null
        }
        if (changedDuringSave) {
          changedDuringSave = false
          timer = setTimeout(() => void get().save(), 300)
        }
      })()
      return inFlight
    },
    flush: async () => {
      // AI and export read SQLite, so a failed save must stop their caller instead of using an old draft.
      while (get().project) {
        if (inFlight) await inFlight
        if (get().saveState === 'saved') return
        await get().save()
        if (get().saveState === 'error') throw new Error(get().saveError || 'Proyek belum berhasil disimpan. Coba simpan lagi.')
      }
    },

    applyClip: (clipId, patch) => {
      if (!get().clips.some((c) => c.id === clipId)) return
      set({ clips: get().clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) })
      // Main-process timings and repaired links must survive an older snapshot already in flight.
      if (Object.keys(patch).some((key) => !['imageAssetId', 'videoAssetId', 'audioAssetId'].includes(key)) && get().project) touch()
    },
    applyCharacter: (characterId, patch) =>
      set({ characters: get().characters.map((c) => (c.id === characterId ? { ...c, ...patch } : c)) }),
    addAsset: (asset) => {
      if (asset.projectId !== get().project?.id) return
      set({ assets: { ...get().assets, [asset.id]: asset } })
    },
    upsertJob: (job) => {
      if (job.projectId !== get().project?.id) return
      set({ jobs: { ...get().jobs, [job.id]: job } })
    }
  }
})

/** Latest active or recent job of a kind for a clip or character. */
export function jobFor(jobs: Record<string, Job>, kind: Job['kind'], target: { clipId?: string; characterId?: string }): Job | null {
  let best: Job | null = null
  for (const j of Object.values(jobs)) {
    if (j.kind !== kind) continue
    if (target.clipId && j.clipId !== target.clipId) continue
    if (target.characterId && j.characterId !== target.characterId) continue
    if (!best || j.createdAt > best.createdAt) best = j
  }
  return best
}

export const isRunning = (j: Job | null | undefined): boolean => !!j && (j.status === 'queued' || j.status === 'running')
