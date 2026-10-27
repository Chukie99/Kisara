/** Routers may wrap a provider error in several JSON strings. Never return the raw envelope to the UI. */
export function llmErrorFacts(detail: string): { provider: string | null; format: boolean; auth: boolean; context: boolean; missingModel: boolean } {
  const messages: string[] = []
  let provider: string | null = null
  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || value == null) return
    if (typeof value === 'string') {
      const text = value.slice(0, 20000)
      const at = text.indexOf('{')
      try { visit(JSON.parse(at >= 0 ? text.slice(at) : text), depth + 1); return } catch { /* Plain messages are useful for classification only. */ }
      messages.push(text)
    } else if (Array.isArray(value)) {
      value.slice(0, 8).forEach((v) => visit(v, depth + 1))
    } else if (typeof value === 'object') {
      const row = value as Record<string, unknown>
      if (typeof row.provider_name === 'string' && /^[\p{L}\p{N} ._-]{1,50}$/u.test(row.provider_name)) provider = row.provider_name
      for (const key of ['message', 'msg', 'error', 'detail', 'metadata', 'raw']) visit(row[key], depth + 1)
    }
  }
  visit(detail, 0)
  const text = messages.join(' ')
  return {
    provider,
    format: /response_format|json_schema|structured[_ -]outputs?|unsupported (?:parameter|argument)|(?:unknown|unrecognized) (?:parameter|argument)|(?:parameter|argument).{0,60}(?:not supported|unsupported)/i.test(text),
    auth: /api key|credential|unauthenticated|unauthori[sz]ed|user not found/i.test(text),
    context: /context[_ -](?:length|window)|maximum context|too many tokens|input.{0,30}too long|token limit exceeded/i.test(text),
    missingModel: /does not exist|model.{0,60}not found|unknown model/i.test(text)
  }
}
