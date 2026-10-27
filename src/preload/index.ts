import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENTS, type StudioApi } from '../shared/api'

const call =
  <T>(channel: string) =>
  (...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args)

const listen =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }

const api: StudioApi = {
  projects: {
    list: call('projects:list'),
    create: call('projects:create'),
    get: call('projects:get'),
    save: call('projects:save'),
    remove: call('projects:remove'),
    duplicate: call('projects:duplicate')
  },
  story: {
    reviewScript: call('story:reviewScript'),
    refineScript: call('story:refineScript'),
    soundPlan: call('story:soundPlan'),
    script: call('story:script'),
    visualStatus: call('story:visualStatus'),
    cancelVisuals: call('story:cancelVisuals'),
    scriptStatus: call('story:scriptStatus'),
    cancelScript: call('story:cancelScript'),
    idea: call('story:idea'),
    // The typed bridge forwards the source mode and creator brief together with the transcript.
    fromVideo: call('story:fromVideo'),
    youtubeStatus: call('story:youtubeStatus'),
    visuals: call('story:visuals'),
    musicPrompt: call('story:musicPrompt'),
    exportPrompts: call('story:exportPrompts'),
    // Forward optional guide, narration, asset-map or Agent-batch settings through the same typed channel.
    exportFlow: call('story:exportFlow')
  },
  generate: {
    clipImage: call('generate:clipImage'),
    pipeline: call('generate:pipeline'),
    clipVideo: call('generate:clipVideo'),
    clipTts: call('generate:clipTts'),
    characterSheet: call('generate:characterSheet'),
    missingImages: call('generate:missingImages'),
    missingVideos: call('generate:missingVideos'),
    missingTts: call('generate:missingTts'),
    narration: call('generate:narration'),
    syncCaptions: call('generate:syncCaptions'),
    cancel: call('generate:cancel'),
    estimate: call('generate:estimate')
  },
  clips: {
    split: call('clips:split'),
    detachVoice: call('clips:detachVoice')
  },
  assets: {
    prepareMediaImport: call('assets:prepareMediaImport'),
    applyMediaImport: call('assets:applyMediaImport'),
    discardMediaImport: call('assets:discardMediaImport'),
    setActive: call('assets:setActive'),
    setWords: call('assets:setWords'),
    pickMusic: call('assets:pickMusic'),
    pickImage: call('assets:pickImage'),
    pickVideo: call('assets:pickVideo'),
    pickClipImage: call('assets:pickClipImage')
  },
  sfx: {
    auto: call('sfx:auto'),
    search: call('sfx:search'),
    add: call('sfx:add')
  },
  settings: {
    get: call('settings:get'),
    set: call('settings:set'),
    keys: call('settings:keys'),
    setKey: call('settings:setKey'),
    setCustom: call('settings:setCustom'),
    clearKey: call('settings:clearKey'),
    revealKey: call('settings:revealKey'),
    setCloudflare: call('settings:setCloudflare'),
    setHuggingFace: call('settings:setHuggingFace'),
    testKey: call('settings:testKey'),
    testWriter: call('settings:testWriter'),
    voices: call('settings:voices'),
    supertonicStatus: call('settings:supertonic'),
    setF5: call('settings:setF5'),
    pickF5Reference: call('settings:pickF5Reference'),
    testF5: call('settings:testF5'),
    testF5Local: call('settings:testF5Local'),
    pickSupertonicDir: call('settings:pickSupertonic')
  },
  models: {
    list: call('models:list')
  },
  exporter: {
    start: call('export:start'),
    defaultFolder: call('export:defaultFolder'),
    pickFolder: call('export:pickFolder'),
    reveal: call('export:reveal')
  },
  app: {
    openExternal: call('app:openExternal'),
    copyText: call('app:copyText'),
    version: call('app:version')
  },
  whisper: {
    status: call('whisper:status'),
    download: call('whisper:download'),
    cancel: call('whisper:cancel'),
    remove: call('whisper:remove'),
    openFolder: call('whisper:openFolder')
  },
  on: {
    visualProgress: listen(EVENTS.visualProgress),
    scriptProgress: listen(EVENTS.scriptProgress),
    production: listen(EVENTS.production),
    editor: listen(EVENTS.editor),
    whisper: listen(EVENTS.whisper),
    job: listen(EVENTS.job),
    clip: listen(EVENTS.clip),
    character: listen(EVENTS.character),
    asset: listen(EVENTS.asset)
  }
}

contextBridge.exposeInMainWorld('api', api)
