import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem } from '../../../../shared/types/catalog'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { AlertTriangle } from 'lucide-react'
import { validatePlaceholders } from '../../../../shared/utils/validatePlaceholders'

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
    // Deps include translations join so that applying a suggestion (which updates
    // the store directly) causes this effect to re-run and the textarea to update.
  }, [item?.id, item?.translations?.join('\x00')])

  // Validate placeholder consistency in real-time (from local textarea state, before blur)
  const placeholderValidation = useMemo(() => {
    if (!item?.source || !localTranslations[0]?.trim()) return null
    return validatePlaceholders(item.source, localTranslations[0])
  }, [item?.source, localTranslations[0]])

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
        {item.references.length > 0 && (
          <ReferencesPopover references={item.references} />
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

        {/* Placeholder mismatch warning */}
        {placeholderValidation?.hasIssue && (
          <div className="flex gap-1.5 items-start text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5 mt-1">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
            <div>
              <span className="font-medium">Placeholder mismatch</span>
              {placeholderValidation.missing.length > 0 && (
                <span>
                  {' — '}missing:{' '}
                  {placeholderValidation.missing.map((v, i) => (
                    <React.Fragment key={v}>
                      {i > 0 && ', '}
                      <PlaceholderChip token={v} variant="amber" />
                    </React.Fragment>
                  ))}
                </span>
              )}
              {placeholderValidation.extra.length > 0 && (
                <span>
                  {placeholderValidation.missing.length > 0 ? ' · ' : ' — '}
                  unexpected:{' '}
                  {placeholderValidation.extra.map((v, i) => (
                    <React.Fragment key={v}>
                      {i > 0 && ', '}
                      <PlaceholderChip token={v} variant="amber" />
                    </React.Fragment>
                  ))}
                </span>
              )}
            </div>
          </div>
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

// ---------------------------------------------------------------------------
// References popover
// ---------------------------------------------------------------------------

/**
 * Shows a "N references" trigger that reveals all source-file:line references
 * on hover. Uses a portal-free approach: the popover is positioned relative
 * to its own wrapper, which works because the source section is near the top
 * of the editing area and the popover opens downward over the textarea.
 */
function ReferencesPopover({ references }: { references: string[] }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  // Small delay on leave so the user can move the mouse onto the popover itself
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 80)
  }

  const label =
    references.length === 1 ? '1 reference' : `${references.length} references`

  return (
    <div className="relative inline-block mt-1" onMouseEnter={show} onMouseLeave={hide}>
      <span className="text-xs text-muted-foreground cursor-default select-none underline underline-offset-2 decoration-dotted">
        {label}
      </span>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-96 max-h-56 overflow-y-auto bg-popover border border-border shadow-md p-2"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Used in
          </p>
          <div className="space-y-0.5">
            {references.map((ref, i) => (
              <p key={i} className="text-xs font-mono text-foreground truncate" title={ref}>
                {ref}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Placeholder chip helpers
// ---------------------------------------------------------------------------

/**
 * Printf format specifier characters we recognise.
 * Kept in sync with validatePlaceholders.ts.
 */
const PRINTF_SPECS = 'diouxXeEfFgGcrsabu'

/**
 * Splits text into alternating [plain, token, plain, token, …] segments.
 *
 * Recognised token types (in priority order inside the alternation):
 *   ICU simple        {name}
 *   ICU complex       {count, plural, one {# item} other {# items}}
 *                     (one level of nested braces — covers all real-world cases)
 *   Python-named      %(name)s  %(date)d
 *   Printf numbered   %1$s  %2$d
 *   Printf positional %s  %d  (skips %% via negative lookbehind)
 *   HTML/XML tag      <b>  </b>
 *   ICU plural marker #
 */
const PLACEHOLDER_SPLIT_RE = new RegExp(
  `(` +
  // ICU: simple {name} OR complex {count, plural, one {…} other {…}}
  // The inner alternation (?:[^{}]|\{[^{}]*\})* handles one level of nesting,
  // which covers all plural/select/selectordinal forms in practice.
  `\\{[a-zA-Z_$][a-zA-Z0-9_$]*(?:[^{}]|\\{[^{}]*\\})*\\}` +
  `|%\\([a-zA-Z_][a-zA-Z0-9_]*\\)[${PRINTF_SPECS}]` +   // %(name)s
  `|%\\d+\\$[${PRINTF_SPECS}]` +                         // %1$s
  `|(?<!%)%[${PRINTF_SPECS}]` +                          // %s (not preceded by %)
  `|<[^>]+>` +                                           // <tag>
  `|#` +                                                 // plural #
  `)`,
  'g'
)

/** Tests whether a split segment is ANY recognised placeholder token. */
const PLACEHOLDER_IS_RE = new RegExp(
  `^(` +
  `\\{[a-zA-Z_$][a-zA-Z0-9_$]*(?:[^{}]|\\{[^{}]*\\})*\\}` + // ICU (simple or complex)
  `|%\\([a-zA-Z_][a-zA-Z0-9_]*\\)[${PRINTF_SPECS}]` +
  `|%\\d+\\$[${PRINTF_SPECS}]` +
  `|%[${PRINTF_SPECS}]` +
  `|<[^>]+>` +
  `|#` +
  `)$`
)

/** Matches a complex ICU expression: {varName, keyword, …} */
const COMPLEX_ICU_RE = /^\{([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z]+)/

/** Matches a case clause inside a complex ICU: selector { content } */
const ICU_CASE_RE = /\b(zero|one|two|few|many|other|=\d+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g

/** Inline chip for a single placeholder token */
function PlaceholderChip({
  token,
  title,
  variant = 'blue'
}: {
  token: string
  title?: string
  variant?: 'blue' | 'amber'
}) {
  const cls =
    variant === 'amber'
      ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded px-0.5 text-xs font-mono'
      : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded px-0.5 text-xs font-mono'
  return <code className={cls} title={title}>{token}</code>
}

/**
 * Renders a complex ICU plural/select expression with structural parts in blue
 * and the translatable text content inside each case in amber — so translators
 * can immediately see which portions need to change.
 *
 * {hours, plural, one {# hour} other {# hours}}
 *  ─── blue ───────────────────────────────────
 *                       ─amber─        ─amber──
 */
function ComplexIcuDisplay({ expression }: { expression: string }) {
  // Extract the header: "{varName, type, "
  const headerMatch = expression.match(/^\{([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z]+)\s*,\s*/)
  if (!headerMatch) {
    // Can't parse — render as plain mono block (should not normally happen)
    return (
      <code className="bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-700/60 px-0.5 text-xs font-mono whitespace-normal break-words">
        {expression}
      </code>
    )
  }

  // inner = everything between the header and the outer closing "}"
  const inner = expression.slice(headerMatch[0].length, expression.length - 1)

  // Parse each case clause
  const cases: Array<{ selector: string; content: string }> = []
  let m: RegExpExecArray | null
  ICU_CASE_RE.lastIndex = 0
  while ((m = ICU_CASE_RE.exec(inner)) !== null) {
    cases.push({ selector: m[1], content: m[2] })
  }

  if (cases.length === 0) {
    // Couldn't parse cases — fall back to plain display
    return (
      <code className="bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-700/60 px-0.5 text-xs font-mono whitespace-normal break-words">
        {expression}
      </code>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-0 rounded border border-blue-200 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-950/50 text-xs font-mono px-1 py-px leading-snug">
      {/* structural header: {varName, type, */}
      <span className="text-blue-600 dark:text-blue-400">
        {'{' + headerMatch[1] + ', ' + headerMatch[2] + ','}
      </span>
      {cases.map(({ selector, content }, i) => (
        <React.Fragment key={i}>
          {/* case keyword: one / other / =1 … */}
          <span className="text-blue-500 dark:text-blue-400 mx-1">{selector}</span>
          <span className="text-blue-600 dark:text-blue-400">{'{'}</span>
          {/* translatable content — amber so it stands out */}
          <span className="text-amber-700 dark:text-amber-300">{content}</span>
          <span className="text-blue-600 dark:text-blue-400">{'}'}</span>
        </React.Fragment>
      ))}
      {/* outer closing brace */}
      <span className="text-blue-600 dark:text-blue-400">{'}'}</span>
    </span>
  )
}

/**
 * Renders text with all placeholder tokens highlighted.
 *
 * • Simple ICU vars, printf specifiers, HTML tags, `#` → compact blue chip
 * • Complex ICU plural/select → structured display with blue skeleton and
 *   amber translatable text so the translator sees exactly what to change
 */
function HighlightedText({ text }: { text: string }) {
  const parts = text.split(PLACEHOLDER_SPLIT_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (!PLACEHOLDER_IS_RE.test(part)) return <span key={i}>{part}</span>
        if (COMPLEX_ICU_RE.test(part)) {
          return <ComplexIcuDisplay key={i} expression={part} />
        }
        return <PlaceholderChip key={i} token={part} variant="blue" />
      })}
    </>
  )
}
