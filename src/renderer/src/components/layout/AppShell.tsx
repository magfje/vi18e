import React, { useState, useCallback, useEffect } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { useCatalogStore, selectedItem } from '../../store/catalogStore'
import { CatalogList } from '../catalog-list/CatalogList'
import { EditingArea } from '../editing-area/EditingArea'
import { Sidebar } from '../sidebar/Sidebar'
import { StatusBar } from './StatusBar'
import { PreferencesPage } from '../dialogs/PreferencesDialog'
import { api } from '../../lib/api'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu'
import type { RecentFile } from '../../../../shared/types/ipc'
import { FolderOpen, Save, Settings, Clock, ChevronRight, Minus, Square, X } from 'lucide-react'
import { validatePlaceholders } from '../../../../shared/utils/validatePlaceholders'

export function AppShell() {
  const {
    catalog,
    selectedId,
    isDirty,
    isLoading,
    error,
    selectItem,
    updateTranslation,
    setFuzzy,
    setComment,
    openFile,
    saveFile,
    clearError
  } = useCatalogStore()

  const [prefsOpen, setPrefsOpen] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [saveCount, setSaveCount] = useState(0)
  const [isMaximized, setIsMaximized] = useState(false)

  const item = useCatalogStore(selectedItem)

  // Load recent files on mount
  useEffect(() => {
    api.file.recentList().then(setRecentFiles).catch(() => {})
  }, [])

  // Track maximize state
  useEffect(() => {
    return api.win.onMaximizedChanged(setIsMaximized)
  }, [])

  const handleOpen = async () => {
    const resp = await api.file.openDialog({
      title: 'Open Translation File',
      filters: [
        { name: 'Translation Files', extensions: ['json', 'po', 'pot'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (!resp.cancelled && resp.filePaths[0]) {
      await openFile(resp.filePaths[0])
      setPrefsOpen(false)
      // Refresh recent files
      api.file.recentList().then(setRecentFiles).catch(() => {})
    }
  }

  const handleOpenRecent = async (filePath: string) => {
    await openFile(filePath)
    setPrefsOpen(false)
    api.file.recentList().then(setRecentFiles).catch(() => {})
  }

  const handleSave = async () => {
    // Warn if any translated items have placeholder mismatches
    const problematic = (catalog?.items ?? []).filter(
      (item) => item.translations[0]?.trim() && validatePlaceholders(item.source, item.translations[0]).hasIssue
    )
    if (problematic.length > 0) {
      const proceed = window.confirm(
        `${problematic.length} translation${problematic.length === 1 ? '' : 's'} have placeholder mismatches` +
          ` (e.g. {name}, %(date)s, or %s placeholders may have been mistranslated or dropped).\n\nSave anyway?`
      )
      if (!proceed) return
    }
    const ok = await saveFile()
    if (ok) setSaveCount((c) => c + 1)
  }

  const handleApplySuggestion = useCallback(
    (text: string) => {
      if (selectedId !== null) {
        const curr = catalog?.items.find((i) => i.id === selectedId)
        const translations = curr ? [...curr.translations] : ['']
        translations[0] = text
        updateTranslation(selectedId, translations)
      }
    },
    [selectedId, catalog, updateTranslation]
  )

  const formatCapabilities = catalog
    ? { fuzzyTranslations: catalog.formatId === 'gettext-po' }
    : { fuzzyTranslations: false }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Toolbar — draggable titlebar region */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background flex-shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="font-semibold text-sm mr-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Poedit TS</span>

        {/* Interactive toolbar buttons must opt out of drag */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {!prefsOpen && (
            <>
              <Button variant="outline" size="sm" onClick={handleOpen}>
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                Open
              </Button>

              {/* Recent files dropdown */}
              <DropdownMenu
                trigger={
                  <Button variant="ghost" size="sm" title="Recent files">
                    <Clock className="h-3.5 w-3.5" />
                  </Button>
                }
              >
                {recentFiles.length === 0 ? (
                  <DropdownMenuItem disabled>No recent files</DropdownMenuItem>
                ) : (
                  recentFiles.map((f) => (
                    <DropdownMenuItem key={f.filePath} onClick={() => handleOpenRecent(f.filePath)}>
                      <div className="flex flex-col">
                        <span className="font-medium text-xs">{basename(f.filePath)}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {f.filePath}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
                {recentFiles.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleOpen} className="text-muted-foreground">
                      Browse…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={!catalog || !isDirty}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save{isDirty ? ' *' : ''}
              </Button>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Preferences button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Button
            variant={prefsOpen ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setPrefsOpen((v) => !v)}
          >
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Preferences
          </Button>
        </div>

        {/* Window controls */}
        <div
          className="flex items-center ml-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => api.win.minimize()}
            className="flex items-center justify-center w-10 h-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => api.win.maximize()}
            className="flex items-center justify-center w-10 h-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            onClick={() => api.win.close()}
            className="flex items-center justify-center w-10 h-8 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/30 text-sm text-destructive flex items-center justify-between flex-shrink-0">
          <span>{error}</span>
          <button onClick={clearError} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border flex-shrink-0">
          Loading...
        </div>
      )}

      {/* Preferences page (full area) */}
      {prefsOpen ? (
        <div className="flex-1 min-h-0">
          <PreferencesPage onClose={() => setPrefsOpen(false)} />
        </div>
      ) : catalog ? (
        /* Main layout: catalog+sidebar on top, editing area full-width on bottom */
        <PanelGroup orientation="vertical" className="flex-1 min-h-0">
          {/* Top row: Catalog list (left) + Suggestions sidebar (right) */}
          <Panel defaultSize={60} minSize={25}>
            <PanelGroup orientation="horizontal" className="h-full">
              <Panel defaultSize={65} minSize={25}>
                <CatalogList
                  items={catalog.items}
                  selectedId={selectedId}
                  onSelect={selectItem}
                  resortTrigger={saveCount}
                />
              </Panel>

              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

              <Panel defaultSize={35} minSize={15} className="border-l border-border">
                <Sidebar
                  item={item}
                  sourceLanguage={catalog.metadata.sourceLanguage}
                  targetLanguage={catalog.metadata.targetLanguage}
                  onApplySuggestion={handleApplySuggestion}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="h-1 bg-border hover:bg-primary/30 transition-colors cursor-row-resize" />

          {/* Bottom: Editing area full-width */}
          <Panel defaultSize={40} minSize={15} className="border-t border-border">
            <EditingArea
              item={item}
              hasFuzzyCapability={formatCapabilities.fuzzyTranslations}
              onTranslationChange={(translations) => {
                if (selectedId !== null) updateTranslation(selectedId, translations)
              }}
              onFuzzyChange={(fuzzy) => {
                if (selectedId !== null) setFuzzy(selectedId, fuzzy)
              }}
              onCommentChange={(comment) => {
                if (selectedId !== null) setComment(selectedId, comment)
              }}
            />
          </Panel>
        </PanelGroup>
      ) : (
        /* Welcome screen */
        !isLoading && <WelcomeScreen recentFiles={recentFiles} onOpen={handleOpen} onOpenRecent={handleOpenRecent} />
      )}

      {/* Status bar — hidden when preferences are open */}
      {!prefsOpen && (
        <StatusBar
          stats={catalog?.stats ?? null}
          filePath={catalog?.filePath ?? null}
          referenceFilePath={catalog?.referenceFilePath ?? null}
          isDirty={isDirty}
          sourceLanguage={catalog?.metadata.sourceLanguage ?? ''}
          targetLanguage={catalog?.metadata.targetLanguage ?? ''}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  recentFiles: RecentFile[]
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
}

function WelcomeScreen({ recentFiles, onOpen, onOpenRecent }: WelcomeScreenProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-8 py-12">
        {/* App title */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-1">Poedit TS</h2>
          <p className="text-muted-foreground text-sm">
            Open a translation file to start editing.
          </p>
        </div>

        {/* Open button */}
        <Button size="lg" onClick={onOpen} className="mb-10">
          <FolderOpen className="h-4 w-4 mr-2" />
          Open File…
        </Button>

        {/* Recent files */}
        {recentFiles.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Files
            </h3>
            <div className="space-y-1.5">
              {recentFiles.map((f) => (
                <button
                  key={f.filePath}
                  onClick={() => onOpenRecent(f.filePath)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent/60 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{basename(f.filePath)}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {f.filePath}
                    </div>
                  </div>

                  {f.targetLanguage && (
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full flex-shrink-0 font-mono">
                      → {f.targetLanguage}
                    </span>
                  )}

                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Cross-platform basename without importing node:path in renderer */
function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}
