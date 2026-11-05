import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import { resolve } from 'node:path'

/** Synchronous child stderr must stay captured when the desktop launcher has closed its pipe. */
export function runFixtureTool(executable: string, args: string[], options: ExecFileSyncOptions = {}): void {
  execFileSync(executable, args, {
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/** A capture plan alone must never enable test actions against the normal user library. */
export function isolatedHarnessProfile(profile: string | undefined, actualProfile: string, protectedProfiles: string[]): boolean {
  if (!profile) return false
  const canonical = (value: string): string => resolve(value).toLowerCase()
  const requested = canonical(profile)
  return requested === canonical(actualProfile) && !protectedProfiles.some(value => canonical(value) === requested)
}
