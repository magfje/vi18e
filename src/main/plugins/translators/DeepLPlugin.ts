import type { TranslatorPlugin, TranslationQuery, Suggestion } from '../../../shared/types/plugins'
import { toDeepLSourceCode, toDeepLTargetCode } from '../../../shared/utils/languages'

/**
 * DeepL free API translator plugin.
 * Direct TypeScript port of the C++ DeepLXClient (src/deeplx_client.cpp).
 *
 * API key stored in electron-store under "translator.deepl.apiKey".
 * Returns [] if no key is set — never throws.
 */
export class DeepLPlugin implements TranslatorPlugin {
  readonly id = 'deepl'
  readonly displayName = 'DeepL'
  readonly requiresApiKey = true
  readonly settingsPrefix = 'translator.deepl'

  private getSettings(): { apiKey: string; endpoint: string } {
    // Dynamic import to avoid issues with electron-store in renderer context
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Store = require('electron-store')
    const store = new Store()
    const apiKey = store.get(`${this.settingsPrefix}.apiKey`, '') as string
    const endpoint = store.get(
      `${this.settingsPrefix}.endpoint`,
      'https://api-free.deepl.com/v2/translate'
    ) as string

    console.log(
      `[DeepLPlugin] getSettings: apiKey=${apiKey ? apiKey.slice(0, 8) + '…' : '(empty)'}  endpoint=${endpoint}`
    )
    return { apiKey, endpoint }
  }

  isAvailable(): boolean {
    const { apiKey } = this.getSettings()
    const ok = apiKey.trim().length > 0
    console.log(`[DeepLPlugin] isAvailable → ${ok}`)
    return ok
  }

  async suggest(query: TranslationQuery): Promise<Suggestion[]> {
    const { apiKey, endpoint } = this.getSettings()
    if (!apiKey.trim()) {
      console.log('[DeepLPlugin] suggest: skipped — no API key')
      return []
    }

    const srcLang = toDeepLSourceCode(query.sourceLanguage)
    const tgtLang = toDeepLTargetCode(query.targetLanguage)
    const body = {
      text: [query.sourceText],
      source_lang: srcLang,
      target_lang: tgtLang
    }

    console.log(`[DeepLPlugin] suggest: POST ${endpoint}`, {
      source_lang: srcLang,
      target_lang: tgtLang,
      text: query.sourceText.slice(0, 60)
    })

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `DeepL-Auth-Key ${apiKey}`
        },
        body: JSON.stringify(body)
      })

      console.log(`[DeepLPlugin] response: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        console.error(`[DeepLPlugin] HTTP ${response.status} error body:`, errBody.slice(0, 300))
        return []
      }

      const data = (await response.json()) as {
        translations?: Array<{ text: string }>
      }

      console.log('[DeepLPlugin] translations received:', data.translations?.map((t) => t.text.slice(0, 60)))

      return (data.translations ?? [])
        .map((t) => t.text.trim())
        .filter(Boolean)
        .map((text) => ({
          text,
          score: 0.0,
          storedAt: 0,
          source: this.displayName
        }))
    } catch (err) {
      console.error('[DeepLPlugin] fetch threw:', err)
      return []
    }
  }
}
