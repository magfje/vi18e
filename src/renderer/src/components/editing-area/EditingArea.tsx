import React, { useEffect, useState } from 'react'
import type { CatalogItem } from '../../../../shared/types/catalog'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'

interface EditingAreaProps {
  item: CatalogItem | null
  hasFuzzyCapability: boolean
  onTranslationChange: (translations: string[]) => void
  onFuzzyChange: (fuzzy: boolean) => void
  onCommentChange: (comment: string) => void
}

export function EditingArea({
  item,
  hasFuzzyCapability,
  onTranslationChange,
  onFuzzyChange,
  onCommentChange
}: EditingAreaProps) {
  const isPlural = Boolean(item?.sourcePlural)
  const pluralCount = isPlural ? Math.max(2, item?.translations.length ?? 2) : 1

  const [localTranslations, setLocalTranslations] = useState<string[]>([''])
  const [localComment, setLocalComment] = useState('')
  const [activePluralTab, setActivePluralTab] = useState(0)

  useEffect(() => {
    const t = item?.translations ?? ['']
    // Ensure we have the right number of slots for plural forms
    const filled = Array.from({ length: isPlural ? pluralCount : 1 }, (_, i) => t[i] ?? '')
    setLocalTranslations(filled)
    setLocalComment(item?.comment ?? '')
    setActivePluralTab(0)
  }, [item?.id])

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Select an entry to edit
      </div>
    )
  }

  const handleTranslationBlur = () => {
    onTranslationChange(localTranslations)
  }

  const handlePluralChange = (index: number, value: string) => {
    const next = [...localTranslations]
    while (next.length <= index) next.push('')
    next[index] = value
    setLocalTranslations(next)
  }

  const handleCommentBlur = () => {
    onCommentChange(localComment)
  }

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-y-auto">
      {/* Item header */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground font-mono">#{item.id}</span>
        {item.context && (
          <Badge variant="outline" className="text-xs">{item.context}</Badge>
        )}
        {item.isFuzzy && <Badge variant="warning">Fuzzy</Badge>}
        {item.status === 'untranslated' && <Badge variant="destructive">Untranslated</Badge>}
        {isPlural && <Badge variant="outline" className="text-xs">Plural</Badge>}
      </div>

      {/* Source text */}
      <div className="flex-shrink-0">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Source</label>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm select-text">
          <HighlightedText text={item.source} />
        </div>
        {isPlural && item.sourcePlural && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm select-text mt-1">
            <span className="text-xs text-muted-foreground mr-1">Plural:</span>
            <HighlightedText text={item.sourcePlural} />
          </div>
        )}
        {item.extractedComments.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            {item.extractedComments.join(' · ')}
          </p>
        )}
      </div>

      {/* Translation input */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Translation</label>
            {/* Plural form tabs */}
            {isPlural && (
              <div className="flex gap-0.5">
                {Array.from({ length: pluralCount }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePluralTab(i)}
                    className={cn(
                      'px-2 py-0.5 rounded text-xs border transition-colors',
                      activePluralTab === i
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {i === 0 ? 'Singular' : i === 1 ? 'Plural' : `Form ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          {hasFuzzyCapability && (
            <button
              onClick={() => onFuzzyChange(!item.isFuzzy)}
              className={cn(
                'text-xs px-2 py-0.5 rounded border transition-colors',
                item.isFuzzy
                  ? 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : 'border-input text-muted-foreground hover:bg-muted'
              )}
            >
              {item.isFuzzy ? '✓ Needs work' : 'Mark as fuzzy'}
            </button>
          )}
        </div>

        {/* Single or plural translation textarea */}
        {!isPlural ? (
          <textarea
            value={localTranslations[0]}
            onChange={(e) => setLocalTranslations([e.target.value])}
            onBlur={handleTranslationBlur}
            placeholder="Enter translation..."
            className="flex-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        ) : (
          <textarea
            key={activePluralTab}
            value={localTranslations[activePluralTab] ?? ''}
            onChange={(e) => handlePluralChange(activePluralTab, e.target.value)}
            onBlur={handleTranslationBlur}
            placeholder={activePluralTab === 0 ? 'Singular form…' : `Plural form ${activePluralTab + 1}…`}
            className="flex-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        )}
      </div>

      {/* Comment */}
      <div className="flex-shrink-0">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Translator comment
        </label>
        <textarea
          value={localComment}
          onChange={(e) => setLocalComment(e.target.value)}
          onBlur={handleCommentBlur}
          placeholder="Add a note for other translators..."
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>
    </div>
  )
}

/** Highlight Format.js / ICU placeholders like {name}, #, <b> */
function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\}|<[^>]+>|#)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^\{[^}]+\}$|^<[^>]+>$|^#$/.test(part) ? (
          <code key={i} className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded px-0.5 text-xs font-mono">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
