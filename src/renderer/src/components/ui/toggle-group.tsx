import React from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ToggleGroupCtx {
  value: string
  onValueChange: (value: string) => void
}

const ToggleGroupContext = React.createContext<ToggleGroupCtx>({
  value: '',
  onValueChange: () => {}
})

// ---------------------------------------------------------------------------
// ToggleGroup
// ---------------------------------------------------------------------------

interface ToggleGroupProps {
  /** The currently selected value */
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

/**
 * A single-select segmented button group.
 * Uses `divide-x divide-input` to render borders between items automatically.
 */
export function ToggleGroup({ value, onValueChange, children, className }: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div
        role="group"
        className={cn(
          'inline-flex rounded-md border border-input overflow-hidden divide-x divide-input',
          className
        )}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// ToggleGroupItem
// ---------------------------------------------------------------------------

interface ToggleGroupItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function ToggleGroupItem({ value, children, className }: ToggleGroupItemProps) {
  const { value: selectedValue, onValueChange } = React.useContext(ToggleGroupContext)
  const isActive = selectedValue === value

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={() => onValueChange(value)}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50',
        className
      )}
    >
      {children}
    </button>
  )
}
