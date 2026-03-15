import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Styled native <select> — no custom dropdown, keeps full OS/browser
 * accessibility for free.  Matches the look of <Input>.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
        'focus:outline-none focus:ring-1 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'
