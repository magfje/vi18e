import React, { useEffect, useState, useCallback } from 'react'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Separator } from '../ui/separator'
import { api } from '../../lib/api'
import type { PreferencesData } from '../../../../shared/types/ipc'
import { cn } from '../../lib/utils'

interface PreferencesDialogProps {
  open: boolean
  onClose: () => void
}

type Tab = 'general' | 'translators' | 'memory'

interface TMStats {
  entryCount: number
  dbSizeBytes: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PreferencesDialog({ open, onClose }: PreferencesDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [prefs, setPrefs] = useState<PreferencesData | null>(null)
  const [tmStats, setTmStats] = useState<TMStats | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isClearingTM, setIsClearingTM] = useState(false)
  const [saved, setSaved] = useState(false)

  // Local editable state
  const [deeplApiKey, setDeeplApiKey] = useState('')
  const [deeplEndpoint, setDeeplEndpoint] = useState('https://api-free.deepl.com/v2/translate')
  const [defaultSourceLang, setDefaultSourceLang] = useState('en')
  const [defaultTargetLang, setDefaultTargetLang] = useState('')
  const [autoFetch, setAutoFetch] = useState(true)

  const loadData = useCallback(async () => {
    const [p, stats] = await Promise.allSettled([api.prefs.get(), api.tm.stats()])

    if (p.status === 'fulfilled') {
      const data = p.value
      setPrefs(data)
      setDefaultSourceLang(data.general.defaultSourceLanguage ?? 'en')
      setDefaultTargetLang(data.general.defaultTargetLanguage ?? '')
      setAutoFetch(data.general.autoFetchSuggestions ?? true)
      const deepl = data.translators['translator.deepl'] ?? {}
      setDeeplApiKey(deepl.apiKey ?? '')
      setDeeplEndpoint(deepl.endpoint ?? 'https://api-free.deepl.com/v2/translate')
    }

    if (stats.status === 'fulfilled') {
      setTmStats(stats.value)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setActiveTab('general')
      setSaved(false)
      loadData()
    }
  }, [open, loadData])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await api.prefs.set({
        general: {
          defaultSourceLanguage: defaultSourceLang,
          defaultTargetLanguage: defaultTargetLang,
          autoFetchSuggestions: autoFetch
        },
        translators: {
          'translator.deepl': {
            apiKey: deeplApiKey,
            endpoint: deeplEndpoint
          }
        }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearTM = async () => {
    if (!confirm('Clear all Translation Memory entries? This cannot be undone.')) return
    setIsClearingTM(true)
    try {
      await api.tm.clear()
      const stats = await api.tm.stats()
      setTmStats(stats)
    } finally {
      setIsClearingTM(false)
    }
  }

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} title="Preferences" className="max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-5 -mx-6 px-6 pb-0">
        {(['general', 'translators', 'memory'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'general' ? 'General' : tab === 'translators' ? 'Translators' : 'Translation Memory'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'general' && (
        <GeneralTab
          defaultSourceLang={defaultSourceLang}
          defaultTargetLang={defaultTargetLang}
          autoFetch={autoFetch}
          onSourceLangChange={setDefaultSourceLang}
          onTargetLangChange={setDefaultTargetLang}
          onAutoFetchChange={setAutoFetch}
        />
      )}

      {activeTab === 'translators' && (
        <TranslatorsTab
          deeplApiKey={deeplApiKey}
          deeplEndpoint={deeplEndpoint}
          onApiKeyChange={setDeeplApiKey}
          onEndpointChange={setDeeplEndpoint}
        />
      )}

      {activeTab === 'memory' && (
        <MemoryTab
          stats={tmStats}
          isClearing={isClearingTM}
          onClear={handleClearTM}
          onRefresh={async () => {
            const s = await api.tm.stats()
            setTmStats(s)
          }}
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
        {saved && (
          <span className="text-sm text-green-600 mr-auto">Settings saved</span>
        )}
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// General tab
// ---------------------------------------------------------------------------

interface GeneralTabProps {
  defaultSourceLang: string
  defaultTargetLang: string
  autoFetch: boolean
  onSourceLangChange: (v: string) => void
  onTargetLangChange: (v: string) => void
  onAutoFetchChange: (v: boolean) => void
}

function GeneralTab({
  defaultSourceLang,
  defaultTargetLang,
  autoFetch,
  onSourceLangChange,
  onTargetLangChange,
  onAutoFetchChange
}: GeneralTabProps) {
  return (
    <div className="space-y-5">
      <FieldRow label="Default source language" hint='BCP-47 code, e.g. "en"'>
        <Input
          value={defaultSourceLang}
          onChange={(e) => onSourceLangChange(e.target.value)}
          placeholder="en"
          className="max-w-xs"
        />
      </FieldRow>

      <FieldRow label="Default target language" hint='BCP-47 code, e.g. "de", "fr", "ja"'>
        <Input
          value={defaultTargetLang}
          onChange={(e) => onTargetLangChange(e.target.value)}
          placeholder="de"
          className="max-w-xs"
        />
      </FieldRow>

      <Separator />

      <FieldRow label="Auto-fetch suggestions" hint="Automatically query Translation Memory and translators when an item is selected">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoFetch}
            onChange={(e) => onAutoFetchChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Enabled</span>
        </label>
      </FieldRow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Translators tab
// ---------------------------------------------------------------------------

interface TranslatorsTabProps {
  deeplApiKey: string
  deeplEndpoint: string
  onApiKeyChange: (v: string) => void
  onEndpointChange: (v: string) => void
}

function TranslatorsTab({
  deeplApiKey,
  deeplEndpoint,
  onApiKeyChange,
  onEndpointChange
}: TranslatorsTabProps) {
  const [showKey, setShowKey] = useState(false)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-1">DeepL</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Sign up for a free account at{' '}
          <a
            href="https://www.deepl.com/pro#developer"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            deepl.com
          </a>{' '}
          to get an API key (500,000 characters/month free).
        </p>

        <FieldRow label="API key">
          <div className="flex gap-2 max-w-sm">
            <Input
              type={showKey ? 'text' : 'password'}
              value={deeplApiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? 'Hide' : 'Show'}
            </Button>
          </div>
        </FieldRow>

        <div className="mt-4">
          <FieldRow
            label="API endpoint"
            hint="Change only if using a DeepLX proxy or custom endpoint"
          >
            <Input
              value={deeplEndpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              placeholder="https://api-free.deepl.com/v2/translate"
              className="font-mono text-xs max-w-sm"
            />
          </FieldRow>
          <button
            type="button"
            onClick={() => onEndpointChange('https://api-free.deepl.com/v2/translate')}
            className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Reset to default
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Translation Memory tab
// ---------------------------------------------------------------------------

interface MemoryTabProps {
  stats: TMStats | null
  isClearing: boolean
  onClear: () => void
  onRefresh: () => Promise<void>
}

function MemoryTab({ stats, isClearing, onClear, onRefresh }: MemoryTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-3">Translation Memory Database</h3>

        {stats ? (
          <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entries</span>
              <span className="font-mono font-medium">{stats.entryCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database size</span>
              <span className="font-mono font-medium">{formatBytes(stats.dbSizeBytes)}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Loading stats…
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={isClearing || (stats?.entryCount ?? 0) === 0}
            className="text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            {isClearing ? 'Clearing…' : 'Clear All Entries'}
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-1">About Translation Memory</h3>
        <p className="text-xs text-muted-foreground">
          Translations are automatically saved to the TM when you save a file. Exact matches score
          1.0; fuzzy matches (≥50% similarity) score 0.5–0.99. Remote translator suggestions always
          score 0.0 and appear below TM results.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout helper
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
      <div className="pt-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}
