import React, { useEffect, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import type { CatalogItem } from '@shared/types/catalog'
import { useSuggestionsStore } from '@/store/suggestionsStore'
import { SuggestionCard } from './SuggestionCard'
import { Separator } from '../ui/separator'

interface SidebarProps {
  item: CatalogItem | null
  sourceLanguage: string
  targetLanguage: string
  onApplySuggestion: (text: string) => void
}

export function Sidebar({ item, sourceLanguage, targetLanguage, onApplySuggestion }: SidebarProps) {
  const { suggestions, isLoading, fetchSuggestions, clearSuggestions, deleteSuggestion } =
    useSuggestionsStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!item || !item.source) {
      clearSuggestions()
      return
    }
    // 300ms debounce
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(item.source, sourceLanguage, targetLanguage)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [item?.id, sourceLanguage, targetLanguage])

  // Ctrl+1 through Ctrl+9 to apply suggestions
  for (let i = 1; i <= 9; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkeys(`ctrl+${i}`, () => {
      const s = suggestions[i - 1]
      if (s) onApplySuggestion(s.text)
    }, { enableOnFormTags: true })
  }

  const exactSuggestions = suggestions.filter((s) => s.score === 1.0)
  const otherSuggestions = suggestions.filter((s) => s.score < 1.0)

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">
        Suggestions
      </h3>

      {isLoading && (
        <div className="h-14 rounded-md border border-border bg-muted animate-pulse" />
      )}

      {!isLoading && suggestions.length === 0 && item && (
        <p className="text-xs text-muted-foreground">No suggestions available.</p>
      )}

      {!isLoading && !item && (
        <p className="text-xs text-muted-foreground">Select an entry to see suggestions.</p>
      )}

      {exactSuggestions.length > 0 && (
        <div className="space-y-1">
          {exactSuggestions.map((s, i) => (
            <SuggestionCard
              key={s.id ?? i}
              suggestion={s}
              index={i}
              onApply={onApplySuggestion}
              onDelete={s.id ? deleteSuggestion : undefined}
            />
          ))}
        </div>
      )}

      {exactSuggestions.length > 0 && otherSuggestions.length > 0 && (
        <Separator className="my-1" />
      )}

      {otherSuggestions.length > 0 && (
        <div className="space-y-1">
          {otherSuggestions.map((s, i) => (
            <SuggestionCard
              key={s.id ?? i}
              suggestion={s}
              index={exactSuggestions.length + i}
              onApply={onApplySuggestion}
              onDelete={s.id ? deleteSuggestion : undefined}
            />
          ))}
        </div>
      )}

      {item?.extractedComments && item.extractedComments.length > 0 && (
        <>
          <Separator className="my-1" />
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1">Notes</h4>
            {item.extractedComments.map((c) => (
              <p key={c} className="text-xs text-muted-foreground">{c}</p>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
