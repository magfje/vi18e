import React from 'react'
import type { ItemStatus } from '../../../../shared/types/catalog'
import { cn } from '../../lib/utils'

interface StatusBadgeProps {
  status: ItemStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
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
  return (
    <span
      title={labels[status]}
      className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', colors[status], className)}
    />
  )
}
