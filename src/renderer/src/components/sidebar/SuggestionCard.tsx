import React from 'react'
import type { Suggestion } from '../../../../shared/types/plugins'
import { cn } from '../../lib/utils'
import { Trash2 } from 'lucide-react'

interface SuggestionCardProps {
  suggestion: Suggestion
  index: number
  onApply: (text: string) => void
  onDelete?: (id: string) => void
}

export function SuggestionCard({ suggestion, index, onApply, onDelete }: SuggestionCardProps) {
  const scoreLabel =
    suggestion.score === 1.0
      ? 'Exact'
      : suggestion.score === 0.0
        ? suggestion.source
        : `${Math.round(suggestion.score * 100)}%`

  const scoreColor =
    suggestion.score === 1.0
      ? 'text-green-600 dark:text-green-400'
      : suggestion.score >= 0.8
        ? 'text-blue-600 dark:text-blue-400'
        : suggestion.score > 0
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-muted-foreground'

  return (
    <button
      onClick={() => onApply(suggestion.text)}
      className="group w-full text-left rounded-md border border-border bg-card hover:bg-muted/50 px-3 py-2 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm overflow-hidden flex-1 min-w-0"
          style={{ lineHeight: '1.45', maxHeight: 'calc(1.45em * 3)' }}
        >
          {suggestion.text}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {index < 9 && (
            <kbd className="text-xs bg-muted border border-border rounded px-1 py-0.5 text-muted-foreground">
              ⌃{index + 1}
            </kbd>
          )}
          {onDelete && suggestion.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(suggestion.id!) }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className={cn('text-xs font-medium', scoreColor)}>{scoreLabel}</span>
        {suggestion.score > 0 && suggestion.score < 1 && (
          <span className="text-xs text-muted-foreground">{suggestion.source}</span>
        )}
      </div>
    </button>
  )
}
