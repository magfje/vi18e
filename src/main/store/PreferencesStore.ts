import Store from 'electron-store'
import type { PreferencesData, RecentFile, TranslatorSettings } from '@shared/types/ipc'

const MAX_RECENT = 10

const defaults: PreferencesData = {
  general: {
    defaultSourceLanguage: 'en',
    defaultTargetLanguage: '',
    autoFetchSuggestions: true,
    theme: 'system'
  },
  translators: {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Store<any>({ defaults })

/**
 * Translator settings are stored using electron-store's dot-path notation so
 * that plugin code can read them directly without going through PreferencesStore.
 *
 * Example: DeepLPlugin.settingsPrefix = 'translator.deepl'
 *   write: store.set('translator.deepl.apiKey', 'xxx')
 *   read:  store.get('translator.deepl.apiKey')   ← what the plugin does
 *
 * The top-level 'translator' key in the store therefore holds all translator
 * settings as a nested object:
 *   { translator: { deepl: { apiKey: 'xxx', endpoint: '...' } } }
 *
 * PreferencesData.translators is keyed by settingsPrefix, e.g.:
 *   { 'translator.deepl': { apiKey: 'xxx', endpoint: '...' } }
 */
export const PreferencesStore = {
  get(): PreferencesData {
    // Read the 'translator' top-level key.  When the plugin writes
    // store.set('translator.deepl.apiKey', '...') electron-store stores it as
    // { translator: { deepl: { apiKey: '...' } } }.  We reverse-map that here
    // into { 'translator.deepl': { apiKey: '...' } } for the UI.
    const allTranslators = store.get('translator', {}) as Record<string, Record<string, string>>
    const translators: Record<string, TranslatorSettings> = {}
    for (const [id, settings] of Object.entries(allTranslators)) {
      if (settings && typeof settings === 'object') {
        translators[`translator.${id}`] = settings as TranslatorSettings
      }
    }

    return {
      general: store.get('general', defaults.general),
      translators
    }
  },

  set(data: Partial<PreferencesData>): void {
    if (data.general) {
      store.set('general', { ...store.get('general', defaults.general), ...data.general })
    }

    if (data.translators) {
      // Write each translator setting using dot-path notation so that plugin
      // code (e.g. DeepLPlugin.getSettings()) can read it with the same path.
      // 'translator.deepl' prefix + 'apiKey' key → store path 'translator.deepl.apiKey'
      for (const [prefix, settings] of Object.entries(data.translators)) {
        if (!settings) continue
        for (const [key, value] of Object.entries(settings)) {
          if (value !== undefined) {
            console.log(`[PreferencesStore] set ${prefix}.${key} =`, key === 'apiKey' ? `${String(value).slice(0, 8)}…` : value)
            store.set(`${prefix}.${key}`, value)
          }
        }
      }
      // Verify it was persisted correctly
      const verify = store.get('translator', {})
      console.log('[PreferencesStore] store.translator after set:', JSON.stringify(verify).replace(/"apiKey":"[^"]{4}[^"]*"/g, '"apiKey":"<masked>"'))
    }
  },

  /** Direct per-key accessor used by plugin code */
  getTranslatorSetting(prefix: string, key: string): string {
    return store.get(`${prefix}.${key}`, '') as string
  },

  /** Direct per-key setter used by plugin code */
  setTranslatorSetting(prefix: string, key: string, value: string): void {
    store.set(`${prefix}.${key}`, value)
  },

  // ---------------------------------------------------------------------------
  // Recent files
  // ---------------------------------------------------------------------------

  getRecentFiles(): RecentFile[] {
    return store.get('recentFiles', []) as RecentFile[]
  },

  pushRecentFile(entry: RecentFile): void {
    const existing: RecentFile[] = store.get('recentFiles', []) as RecentFile[]
    const filtered = existing.filter((f) => f.filePath !== entry.filePath)
    store.set('recentFiles', [entry, ...filtered].slice(0, MAX_RECENT))
  }
}
