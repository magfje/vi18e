import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Catalog, CatalogItem } from '@shared/types/catalog'
import { computeStats, makeItem } from '@shared/types/catalog'
import { validatePlaceholders, placeholderIssueMessage } from '@shared/utils/validatePlaceholders'
import { api } from '@/lib/api'

interface CatalogState {
  catalog: Catalog | null
  selectedId: number | null
  isDirty: boolean
  isLoading: boolean
  error: string | null

  // Actions
  openFile: (filePath: string, referenceFilePath?: string) => Promise<void>
  saveFile: () => Promise<boolean>
  selectItem: (id: number | null) => void
  updateTranslation: (id: number, translations: string[]) => void
  setFuzzy: (id: number, fuzzy: boolean) => void
  setComment: (id: number, comment: string) => void
  setCatalog: (catalog: Catalog) => void
  clearError: () => void
}

export const useCatalogStore = create<CatalogState>()(
  immer((set, get) => ({
    catalog: null,
    selectedId: null,
    isDirty: false,
    isLoading: false,
    error: null,

    openFile: async (filePath, referenceFilePath) => {
      set((s) => { s.isLoading = true; s.error = null })
      try {
        const resp = await api.file.open({ filePath, referenceFilePath })
        if (resp.error || !resp.catalog) {
          set((s) => { s.error = resp.error ?? 'Failed to open file'; s.isLoading = false })
          return
        }
        set((s) => {
          s.catalog = resp.catalog!
          s.selectedId = null
          s.isDirty = false
          s.isLoading = false
        })
      } catch (e) {
        set((s) => { s.error = String(e); s.isLoading = false })
      }
    },

    saveFile: async () => {
      const { catalog } = get()
      if (!catalog) return false
      const resp = await api.file.save({ catalog })
      if (resp.success) {
        set((s) => {
          s.isDirty = false
          // Clear per-item modified flags now that the file is saved
          s.catalog?.items.forEach((item) => { item.isModified = false })
        })
        // Import only modified, translated, non-fuzzy items into TM.
        // Sending the full catalog every save was wasteful (large IPC payload);
        // this reduces it to just the strings that actually changed this session.
        const modifiedItems = catalog.items
          .filter((item) => item.isModified && item.isTranslated && !item.isFuzzy && item.translations[0])
          .map((item) => ({ source: item.source, translation: item.translations[0] }))
        if (modifiedItems.length > 0) {
          await api.tm.import({
            sourceLanguage: catalog.metadata.sourceLanguage,
            targetLanguage: catalog.metadata.targetLanguage,
            items: modifiedItems
          })
        }
      }
      return resp.success
    },

    selectItem: (id) => set((s) => { s.selectedId = id }),

    updateTranslation: (id, translations) =>
      set((s) => {
        if (!s.catalog) return
        const item = s.catalog.items.find((i) => i.id === id)
        if (!item) return
        const prevStatus = item.status
        item.translations = translations
        const hasText = translations[0]?.trim().length > 0
        item.isTranslated = hasText && !item.isFuzzy
        item.status = item.isFuzzy ? 'fuzzy' : hasText ? 'translated' : 'untranslated'
        item.isModified = true
        // Validate placeholders — flag if translation has wrong/missing {vars}
        if (hasText) {
          const pv = validatePlaceholders(item.source, translations[0])
          item.issue = pv.hasIssue
            ? { severity: 'warning', message: placeholderIssueMessage(pv) }
            : undefined
        } else {
          item.issue = undefined
        }
        // O(1) incremental update instead of O(n) full recompute
        if (prevStatus !== item.status) {
          s.catalog.stats[prevStatus]--
          s.catalog.stats[item.status]++
          s.catalog.stats.percentComplete =
            s.catalog.stats.total > 0
              ? Math.round((s.catalog.stats.translated / s.catalog.stats.total) * 100)
              : 0
        }
        s.isDirty = true
      }),

    setFuzzy: (id, fuzzy) =>
      set((s) => {
        if (!s.catalog) return
        const item = s.catalog.items.find((i) => i.id === id)
        if (!item) return
        const prevStatus = item.status
        item.isFuzzy = fuzzy
        if (fuzzy) {
          if (!item.flags.includes('fuzzy')) item.flags.push('fuzzy')
        } else {
          item.flags = item.flags.filter((f) => f !== 'fuzzy')
        }
        const hasText = item.translations[0]?.trim().length > 0
        item.isTranslated = hasText && !fuzzy
        item.status = fuzzy ? 'fuzzy' : hasText ? 'translated' : 'untranslated'
        item.isModified = true
        // O(1) incremental update instead of O(n) full recompute
        if (prevStatus !== item.status) {
          s.catalog.stats[prevStatus]--
          s.catalog.stats[item.status]++
          s.catalog.stats.percentComplete =
            s.catalog.stats.total > 0
              ? Math.round((s.catalog.stats.translated / s.catalog.stats.total) * 100)
              : 0
        }
        s.isDirty = true
      }),

    setComment: (id, comment) =>
      set((s) => {
        if (!s.catalog) return
        const item = s.catalog.items.find((i) => i.id === id)
        if (!item) return
        item.comment = comment
        item.isModified = true
        s.isDirty = true
      }),

    setCatalog: (catalog) => set((s) => { s.catalog = catalog }),

    clearError: () => set((s) => { s.error = null })
  }))
)

// Selector helpers
export const selectedItem = (state: CatalogState): CatalogItem | null => {
  if (!state.catalog || state.selectedId === null) return null
  return state.catalog.items.find((i) => i.id === state.selectedId) ?? null
}
