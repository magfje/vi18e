import React from 'react'
import type { CatalogItem } from '../../../../shared/types/catalog'
import { StatusBadge } from './StatusBadge'
import { cn } from '../../lib/utils'
import { AlertTriangle } from 'lucide-react'

interface CatalogListItemProps {
  item: CatalogItem
  isSelected: boolean
  style?: React.CSSProperties
  onClick: () => void
}

export function CatalogListItem({ item, isSelected, style, onClick }: CatalogListItemProps) {
  return (
    <div
      style={style}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-border text-sm select-none',
        isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/50'
      )}
    >
      <StatusBadge status={item.status} isModified={item.isModified} className="mt-0.5" />
      {item.issue && (
        <AlertTriangle
          className="h-3 w-3 text-amber-500 flex-shrink-0"
          title={item.issue.message}
        />
      )}
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
        <span className="truncate text-foreground">{item.source || item.msgid}</span>
        <span className={cn('truncate', item.isTranslated ? 'text-foreground' : 'text-muted-foreground italic')}>
          {item.translations[0] || '—'}
        </span>
      </div>
    </div>
  )
}
