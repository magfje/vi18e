import { create } from 'zustand'
import type { Suggestion } from '../../../shared/types/plugins'
import { sortSuggestions } from '../../../shared/utils/scoring'
import { api } from '../lib/api'

interface SuggestionsState {
  suggestions: Suggestion[]
  isLoading: boolean

  fetchSuggestions: (
    sourceText: string,
    sourceLanguage: string,
    targetLanguage: string
  ) => Promise<void>
  clearSuggestions: () => void
  deleteSuggestion: (id: string) => void
}

export const useSuggestionsStore = create<SuggestionsState>()((set, get) => ({
  suggestions: [],
  isLoading: false,

  fetchSuggestions: async (sourceText, sourceLanguage, targetLanguage) => {
    if (!sourceText.trim()) {
      set({ suggestions: [], isLoading: false })
      return
    }

    set({ isLoading: true, suggestions: [] })

    // Query TM and translators in parallel
    const [tmResp, translateResp] = await Promise.allSettled([
      api.tm.query({ sourceText, sourceLanguage, targetLanguage, limit: 9 }),
      api.translate.query({ sourceText, sourceLanguage, targetLanguage })
    ])

    const combined: Suggestion[] = []
    if (tmResp.status === 'fulfilled') combined.push(...tmResp.value.suggestions)
    if (translateResp.status === 'fulfilled') combined.push(...translateResp.value.suggestions)

    set({ suggestions: sortSuggestions(combined).slice(0, 9), isLoading: false })
  },

  clearSuggestions: () => set({ suggestions: [], isLoading: false }),

  deleteSuggestion: (id) => {
    api.tm.delete({ id })
    set((s) => ({ suggestions: s.suggestions.filter((sg) => sg.id !== id) }))
  }
}))
