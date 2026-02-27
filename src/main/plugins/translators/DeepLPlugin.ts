import * as deepl from 'deepl-node'
import type { TranslatorPlugin, TranslationQuery, Suggestion } from '../../../shared/types/plugins'
import { toDeepLSourceCode, toDeepLTargetCode } from '../../../shared/utils/languages'

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

    console.log(`[DeepLPlugin] translating: ${srcLang} → ${tgtLang}  formality=${formality}`)

    try {
      const translator = this.makeTranslator(apiKey, serverUrl)
      const opts: deepl.TranslateTextOptions = {}
      if (formality !== 'default') opts.formality = formality

      const result = await translator.translateText(query.sourceText, srcLang, tgtLang, opts)
      const text = result.text?.trim()
      if (!text) return []

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
