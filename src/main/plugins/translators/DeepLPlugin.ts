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
    return {
      apiKey: store.get(`${this.settingsPrefix}.apiKey`, '') as string,
      endpoint: store.get(
        `${this.settingsPrefix}.endpoint`,
        'https://api-free.deepl.com/v2/translate'
      ) as string
    }
  }

  isAvailable(): boolean {
    const { apiKey } = this.getSettings()
    return apiKey.trim().length > 0
  }

  async suggest(query: TranslationQuery): Promise<Suggestion[]> {
    const { apiKey, endpoint } = this.getSettings()
    if (!apiKey.trim()) return []

    const body = {
      text: [query.sourceText],
      source_lang: toDeepLSourceCode(query.sourceLanguage),
      target_lang: toDeepLTargetCode(query.targetLanguage)
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `DeepL-Auth-Key ${apiKey}`
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) return []

      const data = (await response.json()) as {
        translations?: Array<{ text: string }>
      }

      return (data.translations ?? [])
        .map((t) => t.text.trim())
        .filter(Boolean)
        .map((text) => ({
          text,
          score: 0.0,
          storedAt: 0,
          source: this.displayName
        }))
    } catch {
      return []
    }
  }
}
