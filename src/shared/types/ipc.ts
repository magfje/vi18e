/**
 * IPC payload types — request/response shapes for all IPC channels.
 */

import type { Catalog } from './catalog'
import type { Suggestion, TranslationQuery } from './plugins'

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export interface OpenFileRequest {
  filePath: string
  referenceFilePath?: string
  targetLanguage?: string
  sourceLanguage?: string
}

export interface OpenFileResponse {
  catalog: Catalog
  error?: string
}

export interface SaveFileRequest {
  catalog: Catalog
  /** If provided, save to this path instead of catalog.filePath (Save As) */
  targetPath?: string
}

export interface SaveFileResponse {
  success: boolean
  error?: string
}

export interface ShowOpenDialogRequest {
  title: string
  filters: Array<{ name: string; extensions: string[] }>
  multipleFiles?: boolean
}

export interface ShowOpenDialogResponse {
  filePaths: string[]
  cancelled: boolean
}

export interface RecentFile {
  filePath: string
  formatId: string
  targetLanguage: string
  lastOpenedAt: number
}

// ---------------------------------------------------------------------------
// Translation Memory
// ---------------------------------------------------------------------------

export interface TMQueryRequest {
  sourceText: string
  sourceLanguage: string
  targetLanguage: string
  /** Max results (default 9 — matches Poedit's SUGGESTIONS_MENU_ENTRIES) */
  limit?: number
}

export interface TMQueryResponse {
  suggestions: Suggestion[]
}

export interface TMInsertRequest {
  sourceText: string
  translation: string
  sourceLanguage: string
  targetLanguage: string
}

export interface TMDeleteRequest {
  /** UUID of the TM entry to remove */
  id: string
}

export interface TMImportRequest {
  catalog: Catalog
}

export interface TMImportResponse {
  inserted: number
}

export interface TMStatsResponse {
  entryCount: number
  dbSizeBytes: number
}

// ---------------------------------------------------------------------------
// Translator plugins
// ---------------------------------------------------------------------------

export interface TranslateRequest extends TranslationQuery {
  /** Specific plugin ID to use; omit to query all available translators */
  pluginId?: string
}

export interface TranslateResponse {
  suggestions: Suggestion[]
  /** Plugin that produced these suggestions */
  source: string
}

export interface AvailableTranslatorsResponse {
  plugins: Array<{ id: string; displayName: string }>
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface TranslatorSettings {
  apiKey?: string
  endpoint?: string
  [key: string]: string | undefined
}

export interface GeneralSettings {
  defaultSourceLanguage: string
  defaultTargetLanguage: string
  autoFetchSuggestions: boolean
}

export interface PreferencesData {
  general: GeneralSettings
  /** Keyed by plugin settingsPrefix */
  translators: Record<string, TranslatorSettings>
}
