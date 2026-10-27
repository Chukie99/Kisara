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
