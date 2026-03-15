import React, { useEffect, useCallback, useReducer } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { Separator } from '../ui/separator'
import { Switch } from '../ui/switch'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { api } from '@/lib/api'
import type { PreferencesData } from '@shared/types/ipc'
import { cn } from '@/lib/utils'
import { ChevronLeft, Settings2, Languages, Database, Sun, Moon, Monitor } from 'lucide-react'
import { applyTheme, type AppTheme } from '@/lib/theme'

interface PreferencesPageProps {
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

const NAV_ITEMS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'translators', label: 'Translators', icon: Languages },
  { id: 'memory', label: 'Translation Memory', icon: Database }
]

// ---------------------------------------------------------------------------
// Preferences state reducer
// ---------------------------------------------------------------------------

type PrefsState = {
  activeTab: Tab
  // async status
  isSaving: boolean
  isClearingTM: boolean
  saved: boolean
  isLoadingUsage: boolean
  // loaded / fetched data
  tmStats: TMStats | null
  deeplUsage: { characterCount: number; characterLimit: number } | null
  // form fields
  deeplApiKey: string
  deeplFormality: string
  deeplServerUrl: string
  defaultSourceLang: string
  defaultTargetLang: string
  autoFetch: boolean
  theme: AppTheme
}

type PrefsAction =
  | { type: 'SET_TAB'; tab: Tab }
  | { type: 'LOADED'; prefs: PreferencesData }
  | { type: 'SET_TM_STATS'; stats: TMStats }
  | { type: 'SET_DEEPL_API_KEY'; value: string }
  | { type: 'SET_DEEPL_FORMALITY'; value: string }
  | { type: 'SET_DEEPL_SERVER_URL'; value: string }
  | { type: 'SET_SOURCE_LANG'; value: string }
  | { type: 'SET_TARGET_LANG'; value: string }
  | { type: 'SET_AUTO_FETCH'; value: boolean }
  | { type: 'SET_THEME'; value: AppTheme }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR' }
  | { type: 'SAVE_RESET' }
  | { type: 'CLEAR_TM_START' }
  | { type: 'CLEAR_TM_SUCCESS'; stats: TMStats }
  | { type: 'CLEAR_TM_ERROR' }
  | { type: 'USAGE_START' }
  | { type: 'USAGE_SUCCESS'; usage: { characterCount: number; characterLimit: number } }
  | { type: 'USAGE_ERROR' }

const INITIAL_PREFS_STATE: PrefsState = {
  activeTab: 'general',
  isSaving: false,
  isClearingTM: false,
  saved: false,
  isLoadingUsage: false,
  tmStats: null,
  deeplUsage: null,
  deeplApiKey: '',
  deeplFormality: 'default',
  deeplServerUrl: '',
  defaultSourceLang: 'en',
  defaultTargetLang: '',
  autoFetch: true,
  theme: 'system'
}

function prefsReducer(state: PrefsState, action: PrefsAction): PrefsState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab }
    case 'LOADED': {
      const deepl = action.prefs.translators['translator.deepl'] ?? {}
      return {
        ...state,
        defaultSourceLang: action.prefs.general.defaultSourceLanguage ?? 'en',
        defaultTargetLang: action.prefs.general.defaultTargetLanguage ?? '',
        autoFetch: action.prefs.general.autoFetchSuggestions ?? true,
        theme: action.prefs.general.theme ?? 'system',
        deeplApiKey: deepl.apiKey ?? '',
        deeplFormality: deepl.formality ?? 'default',
        deeplServerUrl: deepl.serverUrl ?? ''
      }
    }
    case 'SET_TM_STATS':
      return { ...state, tmStats: action.stats }
    case 'SET_DEEPL_API_KEY':
      return { ...state, deeplApiKey: action.value }
    case 'SET_DEEPL_FORMALITY':
      return { ...state, deeplFormality: action.value }
    case 'SET_DEEPL_SERVER_URL':
      return { ...state, deeplServerUrl: action.value }
    case 'SET_SOURCE_LANG':
      return { ...state, defaultSourceLang: action.value }
    case 'SET_TARGET_LANG':
      return { ...state, defaultTargetLang: action.value }
    case 'SET_AUTO_FETCH':
      return { ...state, autoFetch: action.value }
    case 'SET_THEME':
      return { ...state, theme: action.value }
    case 'SAVE_START':
      return { ...state, isSaving: true }
    case 'SAVE_SUCCESS':
      return { ...state, isSaving: false, saved: true }
    case 'SAVE_ERROR':
      return { ...state, isSaving: false }
    case 'SAVE_RESET':
      return { ...state, saved: false }
    case 'CLEAR_TM_START':
      return { ...state, isClearingTM: true }
    case 'CLEAR_TM_SUCCESS':
      return { ...state, isClearingTM: false, tmStats: action.stats }
    case 'CLEAR_TM_ERROR':
      return { ...state, isClearingTM: false }
    case 'USAGE_START':
      return { ...state, isLoadingUsage: true }
    case 'USAGE_SUCCESS':
      return { ...state, isLoadingUsage: false, deeplUsage: action.usage }
    case 'USAGE_ERROR':
      return { ...state, isLoadingUsage: false, deeplUsage: null }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreferencesPage({ onClose }: PreferencesPageProps) {
  const [state, dispatch] = useReducer(prefsReducer, INITIAL_PREFS_STATE)

  const loadData = useCallback(async () => {
    const [p, tmResult] = await Promise.allSettled([api.prefs.get(), api.tm.stats()])
    if (p.status === 'fulfilled') dispatch({ type: 'LOADED', prefs: p.value })
    if (tmResult.status === 'fulfilled') dispatch({ type: 'SET_TM_STATS', stats: tmResult.value })
  }, [])

  const refreshUsage = useCallback(async () => {
    dispatch({ type: 'USAGE_START' })
    try {
      const usage = await api.translate.usage()
      dispatch({ type: 'USAGE_SUCCESS', usage })
    } catch {
      dispatch({ type: 'USAGE_ERROR' })
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async () => {
    dispatch({ type: 'SAVE_START' })
    try {
      await api.prefs.set({
        general: {
          defaultSourceLanguage: state.defaultSourceLang,
          defaultTargetLanguage: state.defaultTargetLang,
          autoFetchSuggestions: state.autoFetch,
          theme: state.theme
        },
        translators: {
          'translator.deepl': {
            apiKey: state.deeplApiKey,
            formality: state.deeplFormality,
            serverUrl: state.deeplServerUrl
          }
        }
      })
      dispatch({ type: 'SAVE_SUCCESS' })
      setTimeout(() => dispatch({ type: 'SAVE_RESET' }), 2000)
    } catch {
      dispatch({ type: 'SAVE_ERROR' })
    }
  }

  const handleClearTM = async () => {
    if (!confirm('Clear all Translation Memory entries? This cannot be undone.')) return
    dispatch({ type: 'CLEAR_TM_START' })
    try {
      await api.tm.clear()
      const stats = await api.tm.stats()
      dispatch({ type: 'CLEAR_TM_SUCCESS', stats })
    } catch {
      dispatch({ type: 'CLEAR_TM_ERROR' })
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <div className="w-px h-4 bg-border" />

        <h1 className="text-base font-semibold">Preferences</h1>

        <div className="flex-1" />

        {state.saved && <span className="text-sm text-green-600">Settings saved</span>}

        <Button variant="outline" size="sm" onClick={onClose} disabled={state.isSaving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={state.isSaving}>
          {state.isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* Body: left nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar nav */}
        <nav className="w-52 border-r border-border flex-shrink-0 py-3">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => dispatch({ type: 'SET_TAB', tab: id })}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left',
                state.activeTab === id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
          {state.activeTab === 'general' && (
            <GeneralTab
              defaultSourceLang={state.defaultSourceLang}
              defaultTargetLang={state.defaultTargetLang}
              autoFetch={state.autoFetch}
              theme={state.theme}
              onSourceLangChange={(value) => dispatch({ type: 'SET_SOURCE_LANG', value })}
              onTargetLangChange={(value) => dispatch({ type: 'SET_TARGET_LANG', value })}
              onAutoFetchChange={(value) => dispatch({ type: 'SET_AUTO_FETCH', value })}
              onThemeChange={(value) => {
                dispatch({ type: 'SET_THEME', value })
                applyTheme(value) // live preview
              }}
            />
          )}

          {state.activeTab === 'translators' && (
            <TranslatorsTab
              deeplApiKey={state.deeplApiKey}
              deeplFormality={state.deeplFormality}
              deeplServerUrl={state.deeplServerUrl}
              deeplUsage={state.deeplUsage}
              isLoadingUsage={state.isLoadingUsage}
              onApiKeyChange={(value) => dispatch({ type: 'SET_DEEPL_API_KEY', value })}
              onFormalityChange={(value) => dispatch({ type: 'SET_DEEPL_FORMALITY', value })}
              onServerUrlChange={(value) => dispatch({ type: 'SET_DEEPL_SERVER_URL', value })}
              onRefreshUsage={refreshUsage}
            />
          )}

          {state.activeTab === 'memory' && (
            <MemoryTab
              stats={state.tmStats}
              isClearing={state.isClearingTM}
              onClear={handleClearTM}
              onRefresh={async () => {
                const s = await api.tm.stats()
                dispatch({ type: 'SET_TM_STATS', stats: s })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// General tab
// ---------------------------------------------------------------------------

const THEME_OPTIONS: { value: AppTheme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon }
]

interface GeneralTabProps {
  defaultSourceLang: string
  defaultTargetLang: string
  autoFetch: boolean
  theme: AppTheme
  onSourceLangChange: (v: string) => void
  onTargetLangChange: (v: string) => void
  onAutoFetchChange: (v: boolean) => void
  onThemeChange: (v: AppTheme) => void
}

function GeneralTab({
  defaultSourceLang,
  defaultTargetLang,
  autoFetch,
  theme,
  onSourceLangChange,
  onTargetLangChange,
  onAutoFetchChange,
  onThemeChange
}: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold">General</h2>

      <FieldRow label="Theme" hint="Controls the colour scheme of the application">
        <ToggleGroup value={theme} onValueChange={(v) => onThemeChange(v as AppTheme)}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldRow>

      <Separator />

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

      <FieldRow
        label="Auto-fetch suggestions"
        hint="Automatically query Translation Memory and translators when an item is selected"
      >
        <div className="flex items-center gap-2.5">
          <Switch
            id="auto-fetch"
            checked={autoFetch}
            onCheckedChange={onAutoFetchChange}
          />
          <Label htmlFor="auto-fetch" className="cursor-pointer font-normal text-sm">
            Enabled
          </Label>
        </div>
      </FieldRow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Translators tab
// ---------------------------------------------------------------------------

interface TranslatorsTabProps {
  deeplApiKey: string
  deeplFormality: string
  deeplServerUrl: string
  deeplUsage: { characterCount: number; characterLimit: number } | null
  isLoadingUsage: boolean
  onApiKeyChange: (v: string) => void
  onFormalityChange: (v: string) => void
  onServerUrlChange: (v: string) => void
  onRefreshUsage: () => void
}

function TranslatorsTab({
  deeplApiKey,
  deeplFormality,
  deeplServerUrl,
  deeplUsage,
  isLoadingUsage,
  onApiKeyChange,
  onFormalityChange,
  onServerUrlChange,
  onRefreshUsage
}: TranslatorsTabProps) {
  const [showKey, setShowKey] = React.useState(false)

  const usagePct = deeplUsage
    ? Math.round((deeplUsage.characterCount / deeplUsage.characterLimit) * 100)
    : 0

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold">Translators</h2>

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

        {/* Usage stats */}
        <div className="mt-4">
          <FieldRow label="Monthly usage">
            <div className="flex items-center gap-3">
              {deeplUsage ? (
                <div className="flex-1 max-w-xs space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{deeplUsage.characterCount.toLocaleString()} chars used</span>
                    <span>{deeplUsage.characterLimit.toLocaleString()} limit</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        usagePct >= 90 ? 'bg-destructive' : usagePct >= 70 ? 'bg-amber-500' : 'bg-green-500'
                      )}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{usagePct}% used this month</div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  {deeplApiKey ? 'Click Refresh to load usage' : 'Enter API key first'}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefreshUsage}
                disabled={isLoadingUsage || !deeplApiKey}
              >
                {isLoadingUsage ? 'Loading…' : 'Refresh'}
              </Button>
            </div>
          </FieldRow>
        </div>

        <Separator className="my-4" />

        {/* Formality */}
        <FieldRow
          label="Formality"
          hint="Applies to languages that support formal/informal register (e.g. German, French)"
        >
          <Select
            value={deeplFormality}
            onChange={(e) => onFormalityChange(e.target.value)}
          >
            <option value="default">Default (language-specific)</option>
            <option value="prefer_more">Formal</option>
            <option value="prefer_less">Informal</option>
          </Select>
        </FieldRow>

        {/* Custom server URL */}
        <div className="mt-4">
          <FieldRow
            label="Custom server URL"
            hint="Leave empty to use the official DeepL API (auto-detected from key). Set to a DeepLX proxy base URL if needed."
          >
            <Input
              value={deeplServerUrl}
              onChange={(e) => onServerUrlChange(e.target.value)}
              placeholder="https://api-free.deepl.com  (leave empty for auto)"
              className="font-mono text-xs max-w-sm"
            />
          </FieldRow>
          {deeplServerUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onServerUrlChange('')}
              className="mt-1 h-auto py-0.5 px-1 text-xs text-muted-foreground"
            >
              Clear (use auto-detection)
            </Button>
          )}
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
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefresh()
      setIsRefreshing(false)
    } catch {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold">Translation Memory</h2>

      <div>
        <h3 className="text-sm font-semibold mb-3">Database</h3>

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
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
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
