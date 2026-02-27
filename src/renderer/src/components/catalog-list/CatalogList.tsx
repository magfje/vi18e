import React, { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CatalogItem, ItemStatus } from '../../../../shared/types/catalog'
import { CatalogListItem } from './CatalogListItem'
import { cn } from '../../lib/utils'

interface CatalogListProps {
  items: CatalogItem[]
  selectedId: number | null
  onSelect: (id: number) => void
}

type FilterMode = 'all' | ItemStatus

export function CatalogList({ items, selectedId, onSelect }: CatalogListProps) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const parentRef = useRef<HTMLDivElement>(null)

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

  const virtualizer = useVirtualizer({
    count: filtered.length,
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

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30 flex-shrink-0">
        <span className="w-2 flex-shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-2">
          <span>Source</span>
          <span>Translation</span>
        </div>
      </div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const item = filtered[vRow.index]
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
        {filtered.length} of {items.length} entries
      </div>
    </div>
  )
}
