import React from 'react'
import type { CatalogStats } from '../../../../shared/types/catalog'

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
    <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex-shrink-0">
      {fileName && (
        <span className="font-medium text-foreground truncate max-w-xs">
          {fileName}{isDirty ? ' •' : ''}
        </span>
      )}

      {/* Reference file indicator */}
      {refName && (
        <span
          className="truncate max-w-[180px] text-muted-foreground"
          title={`Source file: ${referenceFilePath}`}
        >
          ↑ {refName}
        </span>
      )}

      {stats && (
        <>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${stats.percentComplete}%` }}
              />
            </div>
            <span>{stats.percentComplete}%</span>
          </div>
          <span>{stats.translated} of {stats.total} translated</span>
          {stats.fuzzy > 0 && <span className="text-yellow-600">· {stats.fuzzy} fuzzy</span>}
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        {sourceLanguage && <span>{sourceLanguage}</span>}
        {targetLanguage && <><span>→</span><span>{targetLanguage}</span></>}
      </div>
    </div>
  )
}
