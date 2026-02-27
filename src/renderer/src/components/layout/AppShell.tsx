import React, { useState, useCallback, useEffect } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { useCatalogStore, selectedItem } from '../../store/catalogStore'
import { CatalogList } from '../catalog-list/CatalogList'
import { EditingArea } from '../editing-area/EditingArea'
import { Sidebar } from '../sidebar/Sidebar'
import { StatusBar } from './StatusBar'
import { PreferencesDialog } from '../dialogs/PreferencesDialog'
import { api } from '../../lib/api'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownItem, DropdownSeparator } from '../ui/dropdown'
import type { RecentFile } from '../../../../shared/types/ipc'
import { FolderOpen, Save, Settings, Clock } from 'lucide-react'

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

  const item = useCatalogStore(selectedItem)

  // Load recent files on mount
  useEffect(() => {
    api.file.recentList().then(setRecentFiles).catch(() => {})
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
      // Refresh recent files
      api.file.recentList().then(setRecentFiles).catch(() => {})
    }
  }

  const handleOpenRecent = async (filePath: string) => {
    await openFile(filePath)
    api.file.recentList().then(setRecentFiles).catch(() => {})
  }

  const handleSave = async () => {
    await saveFile()
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
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background flex-shrink-0">
        <span className="font-semibold text-sm mr-2">Poedit TS</span>

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
            <DropdownItem disabled>No recent files</DropdownItem>
          ) : (
            recentFiles.map((f) => (
              <DropdownItem key={f.filePath} onClick={() => handleOpenRecent(f.filePath)}>
                <div className="flex flex-col">
                  <span className="font-medium text-xs">{basename(f.filePath)}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                    {f.filePath}
                  </span>
                </div>
              </DropdownItem>
            ))
          )}
          {recentFiles.length > 0 && (
            <>
              <DropdownSeparator />
              <DropdownItem
                onClick={handleOpen}
                className="text-muted-foreground"
              >
                Browse…
              </DropdownItem>
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

        <div className="flex-1" />

        <Button variant="ghost" size="sm" onClick={() => setPrefsOpen(true)}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Preferences
        </Button>
      </div>

      <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/30 text-sm text-destructive flex items-center justify-between flex-shrink-0">
          <span>{error}</span>
          <button onClick={clearError} className="text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border flex-shrink-0">
          Loading...
        </div>
      )}

      {/* Welcome screen */}
      {!catalog && !isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Open a translation file to get started</p>
            <Button onClick={handleOpen}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Open File
            </Button>
          </div>
        </div>
      )}

      {/* Main 3-pane layout */}
      {catalog && (
        <PanelGroup orientation="horizontal" className="flex-1 min-h-0">
          {/* Left: Catalog list */}
          <Panel defaultSize={35} minSize={20} className="border-r border-border">
            <CatalogList
              items={catalog.items}
              selectedId={selectedId}
              onSelect={selectItem}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

          {/* Center: Editing area */}
          <Panel defaultSize={40} minSize={25}>
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

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

          {/* Right: Suggestions sidebar */}
          <Panel defaultSize={25} minSize={20} className="border-l border-border">
            <Sidebar
              item={item}
              sourceLanguage={catalog.metadata.sourceLanguage}
              targetLanguage={catalog.metadata.targetLanguage}
              onApplySuggestion={handleApplySuggestion}
            />
          </Panel>
        </PanelGroup>
      )}

      {/* Status bar */}
      <StatusBar
        stats={catalog?.stats ?? null}
        filePath={catalog?.filePath ?? null}
        isDirty={isDirty}
        sourceLanguage={catalog?.metadata.sourceLanguage ?? ''}
        targetLanguage={catalog?.metadata.targetLanguage ?? ''}
      />
    </div>
  )
}

/** Cross-platform basename without importing node:path in renderer */
function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}
