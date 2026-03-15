import React, { useEffect, useRef, useReducer, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CatalogItem, ItemStatus } from '@shared/types/catalog'
import { validatePlaceholders } from '@shared/utils/validatePlaceholders'
import { CatalogListItem } from './CatalogListItem'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface CatalogListProps {
  items: CatalogItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  /** Increment this to trigger a re-sort (e.g. after save) */
  resortTrigger?: number
  hasFuzzyCapability?: boolean
}

type FilterMode = 'all' | ItemStatus | 'mismatch'
type SortColumn = 'status' | 'source' | 'translation'
type SortDir = 'asc' | 'desc'

function statusRank(status: string): number {
  if (status === 'untranslated') return 0
  if (status === 'fuzzy') return 1
  return 2
}

// ---------------------------------------------------------------------------
// View state reducer
// ---------------------------------------------------------------------------

type ViewState = {
  filter: FilterMode
  search: string
  sortCol: SortColumn
  sortDir: SortDir
  stableSortedIds: number[]
}

type ViewAction =
  | { type: 'SET_FILTER'; filter: FilterMode }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SORT'; col: SortColumn }
  | { type: 'SET_SORTED_IDS'; ids: number[] }

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case 'SET_FILTER':
      return { ...state, filter: action.filter }
    case 'SET_SEARCH':
      return { ...state, search: action.search }
    case 'SORT':
      if (state.sortCol === action.col)
        return { ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' }
      return { ...state, sortCol: action.col, sortDir: 'asc' }
    case 'SET_SORTED_IDS':
      return { ...state, stableSortedIds: action.ids }
  }
}

const INITIAL_VIEW: ViewState = {
  filter: 'all',
  search: '',
  sortCol: 'status',
  sortDir: 'asc',
  stableSortedIds: []
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CatalogList({ items, selectedId, onSelect, resortTrigger, hasFuzzyCapability = true }: CatalogListProps) {
  'use no memo' // useVirtualizer returns mutable objects incompatible with React Compiler memoization
  const [view, dispatch] = useReducer(viewReducer, INITIAL_VIEW)
  const parentRef = useRef<HTMLDivElement>(null)

  const { filter, search, sortCol, sortDir, stableSortedIds } = view

  // Stable sorted IDs — only recomputed when sort/filter/search params change,
  // or when the loaded file changes (different item IDs). Editing item content
  // (status, translations) does NOT move items around until the next re-sort.
  const itemIdSignature = items.map((i) => i.id).join(',')

  useEffect(() => {
    const filtered = items.filter((item) => {
      if (filter === 'mismatch') {
        const hasMismatch =
          !!item.translations[0]?.trim() &&
          validatePlaceholders(item.source, item.translations[0]).hasIssue
        if (!hasMismatch) return false
      } else if (filter !== 'all' && item.status !== filter) {
        return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          item.source.toLowerCase().includes(q) ||
          item.msgid.toLowerCase().includes(q) ||
          item.translations[0]?.toLowerCase().includes(q)
        )
      }
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'status') {
        cmp = statusRank(a.status) - statusRank(b.status)
        if (cmp === 0) cmp = a.id - b.id
      } else if (sortCol === 'source') {
        cmp = a.source.localeCompare(b.source)
      } else if (sortCol === 'translation') {
        cmp = (a.translations[0] ?? '').localeCompare(b.translations[0] ?? '')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    dispatch({ type: 'SET_SORTED_IDS', ids: sorted.map((i) => i.id) })
  }, [itemIdSignature, sortCol, sortDir, filter, search, resortTrigger])

  // Look up live item data (for up-to-date content/status display) using the stable order
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const displayItems = stableSortedIds
    .map((id) => itemMap.get(id))
    .filter((i): i is CatalogItem => i !== undefined)

  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 5
  })

  const mismatchCount = useMemo(
    () =>
      items.filter(
        (item) =>
          !!item.translations[0]?.trim() &&
          validatePlaceholders(item.source, item.translations[0]).hasIssue,
      ).length,
    [items],
  )

  const tabs: { label: string; value: FilterMode; count?: number }[] = [
    { label: 'All', value: 'all' },
    { label: 'Untranslated', value: 'untranslated' },
    ...(hasFuzzyCapability ? [{ label: 'Fuzzy', value: 'fuzzy' as FilterMode }] : []),
    { label: 'Translated', value: 'translated' },
    ...(mismatchCount > 0
      ? [{ label: 'Mismatch', value: 'mismatch' as FilterMode, count: mismatchCount }]
      : []),
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex border-b border-border px-2 pt-2 gap-1 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => dispatch({ type: 'SET_FILTER', filter: tab.value })}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-t font-medium transition-colors',
              filter === tab.value
                ? tab.value === 'mismatch'
                  ? 'bg-amber-500 text-white'
                  : 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[16px] h-4 px-1',
                filter === tab.value
                  ? 'bg-white/25 text-white'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border flex-shrink-0">
        <input
          type="search"
          placeholder="Search..."
          value={search}
          onChange={(e) => dispatch({ type: 'SET_SEARCH', search: e.target.value })}
          className="w-full text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Sortable column headers */}
      <div className="flex items-center gap-3 px-3 py-1 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30 flex-shrink-0 select-none">
        <SortHeader
          col="status"
          label=""
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={(col) => dispatch({ type: 'SORT', col })}
          className="w-5 flex-shrink-0"
        />
        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          <SortHeader
            col="source"
            label="Source"
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={(col) => dispatch({ type: 'SORT', col })}
          />
          <SortHeader
            col="translation"
            label="Translation"
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={(col) => dispatch({ type: 'SORT', col })}
          />
        </div>
      </div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const item = displayItems[vRow.index]
            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vRow.start}px)`
                }}
              >
                <CatalogListItem
                  item={item}
                  isSelected={item.id === selectedId}
                  onClick={() => onSelect(item.id)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Count */}
      <div className="px-3 py-1 text-xs text-muted-foreground border-t border-border flex-shrink-0">
        {displayItems.length} of {items.length} entries
      </div>
    </div>
  )
}

interface SortHeaderProps {
  col: SortColumn
  label: string
  sortCol: SortColumn
  sortDir: SortDir
  onSort: (col: SortColumn) => void
  className?: string
}

function SortHeader({ col, label, sortCol, sortDir, onSort, className }: SortHeaderProps) {
  const isActive = sortCol === col
  return (
    <button
      onClick={() => onSort(col)}
      className={cn(
        'flex items-center gap-0.5 hover:text-foreground transition-colors',
        isActive ? 'text-foreground' : '',
        className
      )}
    >
      <span>{label}</span>
      {isActive ? (
        sortDir === 'asc' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}
