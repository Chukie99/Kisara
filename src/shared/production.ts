export interface ScriptFinding {
  id: string
  origin: 'local' | 'ai'
  kind: 'empty' | 'repeat' | 'clarity' | 'source' | 'pacing'
  title: string
  detail: string
  clipIds: string[]
  quote?: string
}
export interface ScriptAssessment {
  fingerprint: string
  createdAt: number
  findings: ScriptFinding[]
}
export interface MediaImportRow {
  id: string
  name: string
  kind: 'image' | 'video'
  suggestedClipId: string | null
}
export interface MediaImportPlan {
  token: string
  projectId: string
  rows: MediaImportRow[]
}
export interface MediaImportChoice { fileId: string; clipId: string | null }
export interface FlowSetup {
  browserParallelVersion?: number
  browserBatchVersion?: number
  browserFramesVersion?: number
  browserMediaVersion?: number
  generationPause?: { code: 'unusual_activity' | 'uncertain_result'; pausedAt: number; retryAllowed?: boolean }
  accounts: { id: number; email: string; routeKey: string; workerConnected: boolean; active: boolean; imageEnabled: boolean; browserBusy?: boolean; uncertainResult?: boolean; quotaExhausted?: boolean }[]
  workers: { routeKey: string; label: string }[]
  extensionMode: boolean
}

export interface FlowProfile {
  id: string
  email: string
  routeKey: string
  status: 'starting' | 'login' | 'ready' | 'closed' | 'error'
  message: string
}

export interface FlowBrowserInspection {
  composer?: { editors: number; draftLength: number; submitCount: number; submitDisabled: boolean; busy: boolean; online: boolean }
  host: string
  projectOpen: boolean
  blocked: boolean
  fields: { tag: string; role: string; label: string; placeholder: string }[]
  buttons: { label: string; text: string; disabled: boolean }[]
  options: string[]
}
