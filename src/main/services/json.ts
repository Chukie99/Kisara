/** Remove only trailing commas outside strings; never change quoted text, numbers or missing data. */
function withoutTrailingCommas(text: string): string {
  let quoted = false, escaped = false, result = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (!quoted && char === ',' && /^[\s]*[}\]]/.test(text.slice(i + 1))) continue
    result += char
    if (escaped) { escaped = false; continue }
    if (quoted && char === '\\') { escaped = true; continue }
    if (char === '"') quoted = !quoted
  }
  return result
}

/** Ignore prose/fences around one complete object, but never salvage a nested fragment of a cut-off reply. */
export function extractJson(text: string): unknown {
  const source = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const parse = (value: string): unknown => JSON.parse(withoutTrailingCommas(value))
  try { return parse(source) } catch { /* A complete object may be wrapped in prose or a code fence. */ }
  const results: unknown[] = []
  for (let start = 0; start < source.length; start++) {
    if (source[start] !== '{' && source[start] !== '[') continue
    const stack: string[] = []
    let quoted = false, escaped = false, end = start
    for (; end < source.length; end++) {
      const char = source[end]
      if (escaped) { escaped = false; continue }
      if (quoted && char === '\\') { escaped = true; continue }
      if (char === '"') { quoted = !quoted; continue }
      if (quoted) continue
      if (char === '{' || char === '[') stack.push(char)
      if (char === '}' || char === ']') {
        if (stack.pop() !== (char === '}' ? '{' : '[')) throw new Error('Balasan model berisi JSON yang rusak')
        if (!stack.length) break
      }
    }
    if (stack.length || quoted) throw new Error('Balasan JSON model belum lengkap')
    try { results.push(parse(source.slice(start, end + 1))) } catch { /* Keep scanning after a complete non-JSON prose block. */ }
    start = end
  }
  if (results.length === 1) return results[0]
  throw new Error(results.length > 1 ? 'Balasan model berisi beberapa JSON yang ambigu' : 'Balasan model bukan JSON')
}
