/**
 * Plugin interfaces — compile-time modular system for file formats and translators.
 * To add a new plugin: implement the interface, then register it in src/main/plugins/registry.ts
 */

import type { Catalog, CatalogItem } from './catalog'

// ---------------------------------------------------------------------------
// File Format Plugin
// ---------------------------------------------------------------------------

export interface OpenContext {
  /** Absolute path of the file to open */
  filePath: string
  /**
   * For Format.js: absolute path to the extracted source JSON (with defaultMessage).
   * The plugin uses this to populate CatalogItem.source and extractedComments.
   */
  referenceFilePath?: string
  /** Target language hint (may be inferred from filename) */
  targetLanguage?: string
  /** Source language hint */
  sourceLanguage?: string
}

export interface SaveOptions {
  filePath: string
  /** Format.js only: path to write the compiled translation-only JSON */
  targetFilePath?: string
}

export interface FormatCapabilities {
  /** Whether the format supports the fuzzy/needs-review flag */
  fuzzyTranslations: boolean
  /** Whether the format supports translator comments */
  userComments: boolean
  /** Whether the format supports plural forms */
  plurals: boolean
  /** Whether the format has a context/disambiguation field */
  contextField: boolean
}

/**
 * FileFormatPlugin — read/write a translation file format.
 * All implementations live in src/main/plugins/formats/ and run in the main process.
 */
export interface FileFormatPlugin {
  readonly id: string
  readonly displayName: string
  /** File extensions this plugin handles, without the dot */
  readonly extensions: string[]
  readonly capabilities: FormatCapabilities

  /**
   * Return true if this plugin can handle the given file.
   * Called to select the right plugin when a file is opened.
   */
  canHandle(filePath: string): boolean | Promise<boolean>

  /**
   * Parse the file(s) and return a populated Catalog.
   * Throws a descriptive Error on parse failure.
   */
  open(ctx: OpenContext): Promise<Catalog>

  /**
   * Serialise catalog to disk.
   * Must preserve existing formatting (indentation, line endings) where possible.
   */
  save(catalog: Catalog, options: SaveOptions): Promise<void>
}

// ---------------------------------------------------------------------------
// Translator Plugin
// ---------------------------------------------------------------------------

export interface TranslationQuery {
  sourceLanguage: string
  targetLanguage: string
  sourceText: string
  context?: string
}

/**
 * A single translation suggestion — mirrors Poedit's C++ Suggestion struct.
 */
export interface Suggestion {
  text: string
  /**
   * Quality score:
   * - 1.0 = exact TM match
   * - 0.5–0.99 = fuzzy TM match (based on edit distance)
   * - 0.0 = remote translator (no quality score)
   */
  score: number
  /**
   * Unix timestamp (seconds) when stored in TM.
   * Used to break score ties — mirrors Poedit's localScore.
   * 0 for remote suggestions.
   */
  storedAt: number
  /** Display name shown in the sidebar chip e.g. "TM" | "DeepL" */
  source: string
  /** TM UUID — used when deleting a bad suggestion */
  id?: string
}

/**
 * TranslatorPlugin — provides translation suggestions for a query.
 * Implementations live in src/main/plugins/translators/ and run in the main process.
 * Mirrors Poedit's C++ SuggestionsBackend abstract class.
 */
export interface TranslatorPlugin {
  readonly id: string
  readonly displayName: string
  readonly requiresApiKey: boolean
  /**
   * Prefix for keys in electron-store.
   * e.g. "translator.deepl" → reads "translator.deepl.apiKey"
   */
  readonly settingsPrefix: string

  /** True when the plugin is configured and ready to use */
  isAvailable(): boolean | Promise<boolean>

  /**
   * Return translation suggestions.
   * Must return [] (never throw) if unavailable or on network error.
   */
  suggest(query: TranslationQuery): Promise<Suggestion[]>

  /**
   * Optional: return API usage (e.g. character quota).
   * Returns null if unavailable or not supported.
   */
  getUsage?(): Promise<{ characterCount: number; characterLimit: number } | null>

  /** Optional: called when the user accepts a suggestion */
  onSuggestionAccepted?(suggestion: Suggestion, query: TranslationQuery): void
}

// ---------------------------------------------------------------------------
// Plugin Registry
// ---------------------------------------------------------------------------

export interface PluginRegistry {
  readonly formats: readonly FileFormatPlugin[]
  readonly translators: readonly TranslatorPlugin[]

  /** Find the first format plugin that can handle the given file path */
  findFormat(filePath: string): Promise<FileFormatPlugin | undefined>

  getFormat(id: string): FileFormatPlugin | undefined

  /** All translator plugins that are currently configured and available */
  availableTranslators(): Promise<TranslatorPlugin[]>
}
