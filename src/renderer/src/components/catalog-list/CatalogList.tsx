import React, { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CatalogItem, ItemStatus } from '../../../../shared/types/catalog'
import { CatalogListItem } from './CatalogListItem'
import { cn } from '../../lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface CatalogListProps {
  items: CatalogItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  /** Increment this to trigger a re-sort (e.g. after save) */
  resortTrigger?: number
}

type FilterMode = 'all' | ItemStatus
type SortColumn = 'status' | 'source' | 'translation'
type SortDir = 'asc' | 'desc'

function statusRank(status: string): number {
  if (status === 'untranslated') return 0
  if (status === 'fuzzy') return 1
  return 2
}

export function CatalogList({ items, selectedId, onSelect, resortTrigger }: CatalogListProps) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortColumn>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const parentRef = useRef<HTMLDivElement>(null)

  // Stable sorted IDs — only recomputed when sort/filter/search params change,
  // or when the loaded file changes (different item IDs). Editing item content
  // (status, translations) does NOT move items around until the next re-sort.
  const [stableSortedIds, setStableSortedIds] = useState<number[]>([])
  // Signature of the current item set — changes only when items are added/removed
  const itemIdSignature = items.map((i) => i.id).join(',')

  useEffect(() => {
    const filtered = items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false
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

    setStableSortedIds(sorted.map((i) => i.id))
  }, [itemIdSignature, sortCol, sortDir, filter, search, resortTrigger])

  // Look up live item data (for up-to-date content/status display) using the stable order
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const displayItems = stableSortedIds
    .map((id) => itemMap.get(id))
    .filter((i): i is CatalogItem => i !== undefined)

  const handleSortClick = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 5
  })

  const tabs: { label: string; value: FilterMode }[] = [
    { label: 'All', value: 'all' },
    { label: 'Untranslated', value: 'untranslated' },
    { label: 'Fuzzy', value: 'fuzzy' },
    { label: 'Translated', value: 'translated' }
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex border-b border-border px-2 pt-2 gap-1 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              'px-2 py-1 text-xs rounded-t font-medium transition-colors',
              filter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border flex-shrink-0">
        <input
          type="search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Sortable column headers */}
      <div className="flex items-center gap-3 px-3 py-1 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30 flex-shrink-0 select-none">
        <SortHeader
          col="status"
          label="St"
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSortClick}
          className="w-5 flex-shrink-0"
        />
        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          <SortHeader
            col="source"
            label="Source"
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSortClick}
          />
          <SortHeader
            col="translation"
            label="Translation"
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSortClick}
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
