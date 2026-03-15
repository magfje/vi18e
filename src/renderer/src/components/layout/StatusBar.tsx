import React from 'react'
import type { CatalogStats } from '@shared/types/catalog'

interface StatusBarProps {
  stats: CatalogStats | null
  filePath: string | null
  referenceFilePath?: string | null
  isDirty: boolean
  sourceLanguage: string
  targetLanguage: string
}

/** Cross-platform basename */
function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

export function StatusBar({
  stats,
  filePath,
  referenceFilePath,
  isDirty,
  sourceLanguage,
  targetLanguage
}: StatusBarProps) {
  const fileName = filePath ? basename(filePath) : null
  const refName = referenceFilePath ? basename(referenceFilePath) : null

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex-shrink-0 select-none">
      {fileName && (
        <span
          className="font-medium text-foreground truncate max-w-xs flex-shrink-0"
          title={refName ? `Source: ${referenceFilePath}` : filePath ?? undefined}
        >
          {fileName}{isDirty ? ' •' : ''}
        </span>
      )}

      {stats && (
        <>
          <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden flex-shrink-0">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
          <span className="flex-shrink-0">{stats.translated}/{stats.total}</span>
          {stats.fuzzy > 0 && <span className="text-yellow-600 flex-shrink-0">{stats.fuzzy} fuzzy</span>}
        </>
      )}

      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
        {sourceLanguage && <span>{sourceLanguage}</span>}
        {targetLanguage && <><span>→</span><span>{targetLanguage}</span></>}
      </div>
    </div>
  )
}
