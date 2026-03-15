import * as deepl from 'deepl-node'
import type { TranslatorPlugin, TranslationQuery, Suggestion } from '@shared/types/plugins'
import { toDeepLSourceCode, toDeepLTargetCode } from '@shared/utils/languages'

// Matches ICU simple/complex, Python-named, printf-numbered, printf-positional placeholders
const PLACEHOLDER_RE = /\{[a-zA-Z_$][a-zA-Z0-9_$]*(?:[^{}]|\{[^{}]*\})*\}|%\([a-zA-Z_][a-zA-Z0-9_]*\)[diouxXeEfFgGcrsabu]|%\d+\$[diouxXeEfFgGcrsabu]|(?<!%)%[diouxXeEfFgGcrsabu]/g

/** Detects complex ICU (plural / select / selectordinal) that has translatable case text. */
const COMPLEX_ICU_HEADER_RE = /^\{[^{},]+,\s*(?:plural|select|selectordinal)\s*,/

function protectWhole(match: string, tags: string[]): string {
  const idx = tags.length
  tags.push(match)
  return `<p${idx}/>`
}

/**
 * Explode a complex ICU expression so that structural parts become XML tags
 * (preserved by DeepL) while the case text content stays visible for translation.
 *
 * `{count, plural, one{# item} other{# items}}`
 *   → `<p0/><p1/><p2/> item<p3/> <p4/><p5/> items<p6/><p7/>`
 *
 * tags = ['{count, plural, ', 'one{', '#', '}', 'other{', '#', '}', '}']
 */
function explodeComplexIcu(match: string, tags: string[]): string {
  const headerMatch = match.match(/^\{[^{},]+,\s*(?:plural|select|selectordinal)\s*,\s*/)
  if (!headerMatch) return protectWhole(match, tags)

  const header = headerMatch[0]
  const headerIdx = tags.length
  tags.push(header)
  let result = `<p${headerIdx}/>`

  // Strip header and the outer closing '}'
  const cases = match.slice(header.length, match.length - 1)
  let pos = 0

  while (pos < cases.length) {
    // Pass whitespace between cases through as literal text
    if (/\s/.test(cases[pos])) {
      result += cases[pos++]
      continue
    }

    const braceIdx = cases.indexOf('{', pos)
    if (braceIdx < 0) break

    // Protect "caseKey{"
    const caseOpen = cases.slice(pos, braceIdx + 1) // e.g. "one{" or "other{"
    const openIdx = tags.length
    tags.push(caseOpen)
    result += `<p${openIdx}/>`

    // Find matching closing '}' (depth-aware)
    let depth = 1
    let i = braceIdx + 1
    while (i < cases.length && depth > 0) {
      if (cases[i] === '{') depth++
      else if (cases[i] === '}') depth--
      if (depth > 0) i++
    }
    const caseContent = cases.slice(braceIdx + 1, i)
    pos = i + 1

    // In case content: protect '#' and simple {varName} refs; expose the rest
    result += caseContent.replace(/#|\{[a-zA-Z_$][a-zA-Z0-9_$]*\}/g, (m) => {
      const idx = tags.length
      tags.push(m)
      return `<p${idx}/>`
    })

    // Protect closing '}'
    const closeIdx = tags.length
    tags.push('}')
    result += `<p${closeIdx}/>`
  }

  // Protect the outer closing '}'
  const outerIdx = tags.length
  tags.push('}')
  result += `<p${outerIdx}/>`

  return result
}

/** Replace placeholder tokens with XML tags DeepL will leave untouched. */
function protectPlaceholders(text: string): { text: string; tags: string[] } {
  const tags: string[] = []
  const out = text.replace(PLACEHOLDER_RE, (match) => {
    if (COMPLEX_ICU_HEADER_RE.test(match)) return explodeComplexIcu(match, tags)
    return protectWhole(match, tags)
  })
  return { text: out, tags }
}

/** Restore XML tags back to the original placeholder tokens. */
function restorePlaceholders(text: string, tags: string[]): string {
  return text.replace(/<p(\d+)\/>/g, (_, i) => tags[Number(i)] ?? `<p${i}/>`)
}

/**
 * DeepL translator plugin using the official deepl-node SDK.
 *
 * Settings stored in electron-store under "translator.deepl.*":
 *   apiKey    — DeepL auth key (ends with :fx for free tier, auto-detected by SDK)
 *   formality — 'default' | 'prefer_more' | 'prefer_less'
 *   serverUrl — optional base URL override for proxies/DeepLX (empty = auto)
 */
export class DeepLPlugin implements TranslatorPlugin {
  readonly id = 'deepl'
  readonly displayName = 'DeepL'
  readonly requiresApiKey = true
  readonly settingsPrefix = 'translator.deepl'

  private getSettings(): {
    apiKey: string
    formality: deepl.Formality
    serverUrl: string
  } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Store = require('electron-store')
    const store = new Store()
    const apiKey = store.get(`${this.settingsPrefix}.apiKey`, '') as string
    const formalityRaw = store.get(`${this.settingsPrefix}.formality`, 'default') as string
    const serverUrl = store.get(`${this.settingsPrefix}.serverUrl`, '') as string

    const formalityMap: Record<string, deepl.Formality> = {
      default: 'default',
      prefer_more: 'prefer_more',
      prefer_less: 'prefer_less'
    }
    const formality: deepl.Formality = formalityMap[formalityRaw] ?? 'default'

    console.log(
      `[DeepLPlugin] settings: apiKey=${apiKey ? apiKey.slice(0, 8) + '…' : '(empty)'}` +
        `  formality=${formality}  serverUrl=${serverUrl || '(auto)'}`
    )
    return { apiKey, formality, serverUrl }
  }

  private makeTranslator(apiKey: string, serverUrl?: string): deepl.Translator {
    const opts: deepl.TranslatorOptions = {}
    if (serverUrl?.trim()) opts.serverUrl = serverUrl.trim()
    return new deepl.Translator(apiKey, opts)
  }

  isAvailable(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Store = require('electron-store')
    const store = new Store()
    const apiKey = store.get(`${this.settingsPrefix}.apiKey`, '') as string
    return apiKey.trim().length > 0
  }

  async suggest(query: TranslationQuery): Promise<Suggestion[]> {
    const { apiKey, formality, serverUrl } = this.getSettings()
    if (!apiKey.trim()) {
      console.log('[DeepLPlugin] suggest: skipped — no API key')
      return []
    }

    const srcLang = toDeepLSourceCode(query.sourceLanguage) as deepl.SourceLanguageCode
    const tgtLang = toDeepLTargetCode(query.targetLanguage) as deepl.TargetLanguageCode

    if (!tgtLang.trim()) {
      console.warn('[DeepLPlugin] suggest: skipped — target language is empty (set a default in Preferences → General)')
      return []
    }

    console.log(`[DeepLPlugin] translating: ${srcLang} → ${tgtLang}  formality=${formality}`)

    try {
      const translator = this.makeTranslator(apiKey, serverUrl)
      const opts: deepl.TranslateTextOptions = {}
      if (formality !== 'default') opts.formality = formality

      const { text: protected_, tags } = protectPlaceholders(query.sourceText)
      if (tags.length > 0) {
        opts.tagHandling = 'xml'
        opts.ignoreTags = tags.map((_, i) => `p${i}`)
      }

      const result = await translator.translateText(protected_, srcLang, tgtLang, opts)
      const raw = result.text?.trim()
      if (!raw) return []

      const text = tags.length > 0 ? restorePlaceholders(raw, tags) : raw
      console.log(`[DeepLPlugin] result: "${text.slice(0, 80)}"`)
      return [{ text, score: 0.0, storedAt: 0, source: this.displayName }]
    } catch (err) {
      if (err instanceof deepl.AuthorizationError) {
        console.error('[DeepLPlugin] auth error — check API key')
      } else if (err instanceof deepl.QuotaExceededError) {
        console.error('[DeepLPlugin] quota exceeded for this month')
      } else {
        console.error('[DeepLPlugin] translate error:', err)
      }
      return []
    }
  }

  async getUsage(): Promise<{ characterCount: number; characterLimit: number } | null> {
    const { apiKey, serverUrl } = this.getSettings()
    if (!apiKey.trim()) return null

    try {
      const translator = this.makeTranslator(apiKey, serverUrl)
      const usage = await translator.getUsage()
      if (!usage.character) return null
      console.log(`[DeepLPlugin] usage: ${usage.character.count} / ${usage.character.limit}`)
      return {
        characterCount: usage.character.count,
        characterLimit: usage.character.limit
      }
    } catch (err) {
      console.error('[DeepLPlugin] getUsage error:', err)
      return null
    }
  }
}
