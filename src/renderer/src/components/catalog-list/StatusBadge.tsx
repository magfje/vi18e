import React from 'react'
import type { ItemStatus } from '@shared/types/catalog'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: ItemStatus
  isModified?: boolean
  className?: string
}

export function StatusBadge({ status, isModified, className }: StatusBadgeProps) {
  const colors = {
    untranslated: 'bg-red-500',
    fuzzy: 'bg-yellow-500',
    translated: 'bg-green-500'
  }
  const labels = {
    untranslated: 'Untranslated',
    fuzzy: 'Fuzzy',
    translated: 'Translated'
  }
  const title = isModified ? `${labels[status]} (unsaved)` : labels[status]
  return (
    <span
      title={title}
      className={cn(
        'inline-block h-2 w-2 rounded-full flex-shrink-0',
        colors[status],
        isModified && 'ring-2 ring-orange-400 ring-offset-1 ring-offset-background',
        className
      )}
    />
  )
}
