import Store from 'electron-store'
import type { PreferencesData, RecentFile } from '../../shared/types/ipc'

const MAX_RECENT = 10

const defaults: PreferencesData = {
  general: {
    defaultSourceLanguage: 'en',
    defaultTargetLanguage: '',
    autoFetchSuggestions: true
  },
  translators: {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Store<any>({ defaults })

export const PreferencesStore = {
  get(): PreferencesData {
    return {
      general: store.get('general', defaults.general),
      translators: store.get('translators', {})
    }
  },

  set(data: Partial<PreferencesData>): void {
    if (data.general) store.set('general', { ...store.get('general', defaults.general), ...data.general })
    if (data.translators) {
      const existing = store.get('translators', {})
      store.set('translators', { ...existing, ...data.translators })
    }
  },

  getTranslatorSetting(prefix: string, key: string): string {
    return store.get(`${prefix}.${key}`, '') as string
  },

  setTranslatorSetting(prefix: string, key: string, value: string): void {
    store.set(`${prefix}.${key}`, value)
  },

  // Recent files
  getRecentFiles(): RecentFile[] {
    return store.get('recentFiles', []) as RecentFile[]
  },

  pushRecentFile(entry: RecentFile): void {
    const existing: RecentFile[] = store.get('recentFiles', []) as RecentFile[]
    // Remove duplicates of same filePath, prepend newest
    const filtered = existing.filter((f) => f.filePath !== entry.filePath)
    store.set('recentFiles', [entry, ...filtered].slice(0, MAX_RECENT))
  }
}
