/**
 * Detects format-string placeholder mismatches between source and translation.
 *
 * Recognised placeholder styles:
 *
 *   ICU / Format.js   {name}  {count}  {oldSecretaryName}
 *                     {count, plural, one {# item} other {# items}}
 *                     {gender, select, male {his} female {her} other {their}}
 *   Python-named      %(name)s  %(date)d  %(page_number).2f
 *   Printf numbered   %1$s  %2$d  (argument index, language-reorderable)
 *   Printf positional %s  %d  %i  %f  %g  %e  %x  %o  %u  %c  %r
 *
 * %% (escaped/literal percent) is always ignored.
 *
 * For simple ICU vars the token is the full `{name}`.
 * For complex ICU expressions the token is `{varName}` (the variable that
 * must be preserved — not the plural/select keyword or the inner forms).
 * For printf the token is the full specifier: `%(date)s`, `%1$s`, `%s`.
 */

/** Printf format specifier characters we track */
const PRINTF_SPECS = 'diouxXeEfFgGcrsabu'

/**
 * Replace every `%%` sequence with two null bytes so the remaining
 * single `%` characters are guaranteed to be real format specifiers.
 */
function stripEscapedPercents(text: string): string {
  return text.replace(/%%/g, '\0\0')
}

/**
 * Walk `text` starting at `start` (which must be a `{`), track brace depth,
 * and return the index AFTER the matching `}`.  Returns -1 if unmatched.
 */
function findClosingBrace(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1 // unmatched
}

function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  function push(token: string) {
    if (!seen.has(token)) {
      seen.add(token)
      result.push(token)
    }
  }

  // 1. ICU / Format.js — brace-depth tracking handles both:
  //    • Simple vars:   {name}
  //    • Complex ICU:   {count, plural, one {# item} other {# items}}
  //
  //    We extract the *variable name* (the identifier immediately after `{`).
  //    For simple vars the token is "{name}"; for complex ICU it is "{count}"
  //    (only the selector variable needs to be preserved in translation).
  {
    let i = 0
    while (i < text.length) {
      if (text[i] !== '{') { i++; continue }

      // Must start with a valid JS identifier character
      if (i + 1 >= text.length || !/[a-zA-Z_$]/.test(text[i + 1])) { i++; continue }

      // Collect the identifier
      let j = i + 1
      while (j < text.length && /[a-zA-Z_$0-9]/.test(text[j])) j++
      const varName = text.slice(i + 1, j)

      // Find the matching `}` (handles any nesting depth)
      const end = findClosingBrace(text, i)
      if (end === -1) { i++; continue }

      push(`{${varName}}`)
      i = end // jump past the entire expression (skips nested {…} inside)
    }
  }

  // For printf patterns, neutralise %% first so we never match an escaped %.
  const safe = stripEscapedPercents(text)

  // 2. Python-named printf: %(identifier)format-char
  for (const m of safe.matchAll(
    new RegExp(`%\\([a-zA-Z_][a-zA-Z0-9_]*\\)[${PRINTF_SPECS}]`, 'g')
  )) {
    push(m[0]) // e.g. "%(date)s"
  }

  // 3. Printf numbered: %N$format-char  (e.g. %1$s, %2$d)
  for (const m of safe.matchAll(
    new RegExp(`%\\d+\\$[${PRINTF_SPECS}]`, 'g')
  )) {
    push(m[0]) // e.g. "%1$s"
  }

  // 4. Printf positional: %format-char (not covered by the two patterns above)
  for (const m of safe.matchAll(
    new RegExp(`%(?!\\()(?!\\d+\\$)[${PRINTF_SPECS}]`, 'g')
  )) {
    push(m[0]) // e.g. "%s", "%d"
  }

  return result
}

interface PlaceholderValidation {
  /** Tokens present in source but absent from translation */
  missing: string[]
  /** Tokens in translation that aren't in source */
  extra: string[]
  hasIssue: boolean
}

export function validatePlaceholders(source: string, translation: string): PlaceholderValidation {
  if (!translation.trim()) return { missing: [], extra: [], hasIssue: false }

  const srcVars = extractPlaceholders(source)
  // If the source has no recognised placeholders there is nothing to check.
  if (srcVars.length === 0) return { missing: [], extra: [], hasIssue: false }

  const srcSet = new Set(srcVars)
  const tgtVars = extractPlaceholders(translation)
  const tgtSet = new Set(tgtVars)

  const missing = srcVars.filter((v) => !tgtSet.has(v))
  const extra = tgtVars.filter((v) => !srcSet.has(v))
  return { missing, extra, hasIssue: missing.length > 0 || extra.length > 0 }
}

/**
 * Formats a PlaceholderValidation into a short human-readable warning.
 * Tokens are displayed verbatim (they already include their own delimiters).
 */
export function placeholderIssueMessage(v: PlaceholderValidation): string {
  const parts: string[] = []
  if (v.missing.length > 0) parts.push(`Missing: ${v.missing.join(', ')}`)
  if (v.extra.length > 0) parts.push(`Unexpected: ${v.extra.join(', ')}`)
  return parts.join(' · ')
}
