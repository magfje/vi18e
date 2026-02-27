/**
 * Detects {identifier} placeholder mismatches between source and translation.
 * Simple identifiers only — {name}, {oldSecretaryName}, {count}, etc.
 * Complex ICU patterns like {count, plural, ...} are handled by only matching
 * {word} where the braces contain nothing but a single JS identifier.
 */

function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const re = /\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      result.push(m[1])
    }
  }
  return result
}

export interface PlaceholderValidation {
  /** Vars present in source but absent from translation (likely translated by MT) */
  missing: string[]
  /** Vars in translation that aren't in source (likely renamed/invented) */
  extra: string[]
  hasIssue: boolean
}

export function validatePlaceholders(source: string, translation: string): PlaceholderValidation {
  if (!translation.trim()) return { missing: [], extra: [], hasIssue: false }

  const srcVars = extractPlaceholders(source)
  // If source has no placeholders there's nothing to check
  if (srcVars.length === 0) return { missing: [], extra: [], hasIssue: false }

  const srcSet = new Set(srcVars)
  const tgtVars = extractPlaceholders(translation)
  const tgtSet = new Set(tgtVars)

  const missing = srcVars.filter((v) => !tgtSet.has(v))
  const extra = tgtVars.filter((v) => !srcSet.has(v))
  return { missing, extra, hasIssue: missing.length > 0 || extra.length > 0 }
}

/** Formats a PlaceholderValidation into a short human-readable message */
export function placeholderIssueMessage(v: PlaceholderValidation): string {
  const parts: string[] = []
  if (v.missing.length > 0) parts.push(`Missing: ${v.missing.map((x) => `{${x}}`).join(', ')}`)
  if (v.extra.length > 0) parts.push(`Unexpected: ${v.extra.map((x) => `{${x}}`).join(', ')}`)
  return parts.join(' · ')
}
