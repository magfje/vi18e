/**
 * Core catalog data model.
 */

export type ItemStatus = 'untranslated' | 'fuzzy' | 'translated'

export interface CatalogIssue {
  severity: 'warning' | 'error'
  message: string
}

/**
 * A single translation entry.
 * - For Format.js: msgid = JSON key, source = defaultMessage
 * - For PO/POT: msgid = source text = source
 */
export interface CatalogItem {
  /** 1-based stable index assigned at load time */
  id: number
  /** The key / msgid identifying this entry */
  msgid: string
  /** Human-readable source text (= msgid for PO; defaultMessage for Format.js) */
  source: string
  /** Plural form of the source (msgid_plural in PO; undefined for Format.js) */
  sourcePlural?: string
  /** Target translations — always an array; [0] = singular form */
  translations: string[]
  /** Disambiguation context (msgctxt in PO) */
  context?: string
  /** Translator-written comment */
  comment: string
  /** Auto-extracted comments from source code / "description" field */
  extractedComments: string[]
  /** Raw flag strings e.g. ["fuzzy", "c-format"] */
  flags: string[]
  /**
   * Source-file references extracted from `#:` lines in PO files.
   * Each element is a single `file:line` token, e.g. `"applications/auth/models.py:42"`.
   * Empty for non-Gettext formats.
   */
  references: string[]
  isFuzzy: boolean
  isTranslated: boolean
  isModified: boolean
  isPreTranslated: boolean
  lineNumber: number
  issue?: CatalogIssue
  /** Computed from isFuzzy + isTranslated */
  status: ItemStatus
}

export interface CatalogStats {
  total: number
  translated: number
  fuzzy: number
  untranslated: number
  /** 0–100 */
  percentComplete: number
}

export interface CatalogMetadata {
  /** BCP-47 source language e.g. "en" */
  sourceLanguage: string
  /** BCP-47 target language e.g. "de" */
  targetLanguage: string
  projectName?: string
  translatorName?: string
  translatorEmail?: string
  charset?: string
  /** Any other format-specific header fields */
  [key: string]: string | undefined
}

export interface Catalog {
  filePath: string
  /** ID of the FileFormatPlugin that loaded this catalog */
  formatId: string
  metadata: CatalogMetadata
  items: CatalogItem[]
  stats: CatalogStats
  /**
   * For Format.js / symbolic-ID formats: path to the reference (source) file
   * that supplies human-readable source text.
   */
  referenceFilePath?: string
}

/** Construct a CatalogItem with computed status */
export function makeItem(partial: Omit<CatalogItem, 'status'>): CatalogItem {
  let status: ItemStatus
  if (partial.isFuzzy) {
    status = 'fuzzy'
  } else if (partial.isTranslated) {
    status = 'translated'
  } else {
    status = 'untranslated'
  }
  return { ...partial, status }
}

/** Compute fresh stats from an item array */
export function computeStats(items: CatalogItem[]): CatalogStats {
  const total = items.length
  const translated = items.filter((i) => i.status === 'translated').length
  const fuzzy = items.filter((i) => i.status === 'fuzzy').length
  const untranslated = items.filter((i) => i.status === 'untranslated').length
  return {
    total,
    translated,
    fuzzy,
    untranslated,
    percentComplete: total === 0 ? 0 : Math.round((translated / total) * 100)
  }
}
