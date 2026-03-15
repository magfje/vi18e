import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import type { FileFormatPlugin, OpenContext, SaveOptions, FormatCapabilities } from '@shared/types/plugins'
import type { Catalog } from '@shared/types/catalog'
import { makeItem, computeStats } from '@shared/types/catalog'

/**
 * Format.js (react-intl) JSON format plugin.
 *
 * Supports two reference-file formats:
 *
 *  Format A — flat locale file (the most common setup):
 *    Both the translation file and the source/reference file are plain
 *    key→string maps. The reference provides the human-readable source text.
 *
 *    en.json  (reference):  { "+/GMTn": "Office settings", … }
 *    nb.json  (translation): { "+/GMTn": "Kontorinnstillinger", … }
 *
 *  Format B — extraction output (older workflow):
 *    The reference file has { key: { defaultMessage, description } } objects.
 *    The translation file still has flat key→string values.
 *
 *    extracted.json (reference): { "app.greeting": { "defaultMessage": "Hello {name}!" } }
 *    de.json        (translation): { "app.greeting": "Hallo {name}!" }
 *
 * The plugin auto-selects which format is in use by inspecting the reference file.
 * If no reference file is provided, source text falls back to the key itself.
 */
export class FormatJsPlugin implements FileFormatPlugin {
  readonly id = 'formatjs-json'
  readonly displayName = 'Format.js JSON'
  readonly extensions = ['json']
  readonly capabilities: FormatCapabilities = {
    fuzzyTranslations: false,
    userComments: false,
    plurals: false,
    contextField: false
  }

  canHandle(filePath: string): boolean {
    return extname(filePath).toLowerCase() === '.json'
  }

  async open(ctx: OpenContext): Promise<Catalog> {
    const raw = await readFile(ctx.filePath, 'utf-8')
    let translationData: Record<string, unknown>
    try {
      translationData = JSON.parse(raw)
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${ctx.filePath}\n${String(e)}`)
    }

    // ---------------------------------------------------------------------------
    // Load and classify the reference (source) file
    // ---------------------------------------------------------------------------

    /**
     * Resolved source text lookup: key → { source, extractedComment }
     * Built from the reference file if one is provided.
     */
    const sourceMap = new Map<string, { source: string; comment?: string }>()

    if (ctx.referenceFilePath) {
      const refRaw = await readFile(ctx.referenceFilePath, 'utf-8')
      let refData: Record<string, unknown>
      try {
        refData = JSON.parse(refRaw)
      } catch (e) {
        throw new Error(`Failed to parse reference JSON: ${ctx.referenceFilePath}\n${String(e)}`)
      }

      for (const [key, value] of Object.entries(refData)) {
        if (typeof value === 'string') {
          // Format A: flat locale file — value is the source string directly
          sourceMap.set(key, { source: value })
        } else if (
          typeof value === 'object' &&
          value !== null &&
          'defaultMessage' in (value as object)
        ) {
          // Format B: extraction output — value is { defaultMessage, description? }
          const obj = value as Record<string, unknown>
          sourceMap.set(key, {
            source: String(obj.defaultMessage ?? key),
            comment: typeof obj.description === 'string' ? obj.description : undefined
          })
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Handle the case where the opened file itself is the source
    // (user opened en.json directly — values may be strings or defaultMessage objects)
    // ---------------------------------------------------------------------------

    const firstValue = Object.values(translationData)[0]
    const fileIsSelf =
      !ctx.referenceFilePath &&
      typeof firstValue === 'object' &&
      firstValue !== null &&
      'defaultMessage' in (firstValue as object)

    // ---------------------------------------------------------------------------
    // Build catalog items
    // ---------------------------------------------------------------------------

    let id = 1
    const items = Object.entries(translationData).map(([key, value]) => {
      let source: string
      let extractedComments: string[] = []
      let translation: string

      if (fileIsSelf) {
        // Opened the extraction-format source file directly
        const obj = value as Record<string, unknown>
        source = typeof obj.defaultMessage === 'string' ? obj.defaultMessage : key
        if (typeof obj.description === 'string') extractedComments = [obj.description]
        translation = '' // no translation yet
      } else {
        const ref = sourceMap.get(key)
        if (ref) {
          source = ref.source
          if (ref.comment) extractedComments = [ref.comment]
        } else {
          // No reference file or key missing from reference — fall back to the key
          source = key
        }
        translation = typeof value === 'string' ? value : ''
      }

      const isTranslated = translation.trim().length > 0

      return makeItem({
        id: id++,
        msgid: key,
        source,
        translations: [translation],
        comment: '',
        extractedComments,
        references: [],
        flags: [],
        isFuzzy: false,
        isTranslated,
        isModified: false,
        isPreTranslated: false,
        lineNumber: 0
      })
    })

    // ---------------------------------------------------------------------------
    // For entries that exist in the reference but NOT in the translation file,
    // add them as untranslated so the translator can see they're missing.
    // ---------------------------------------------------------------------------

    if (sourceMap.size > 0) {
      const existingKeys = new Set(Object.keys(translationData))
      for (const [key, ref] of sourceMap) {
        if (!existingKeys.has(key)) {
          items.push(
            makeItem({
              id: id++,
              msgid: key,
              source: ref.source,
              translations: [''],
              comment: '',
              extractedComments: ref.comment ? [ref.comment] : [],
              references: [],
              flags: [],
              isFuzzy: false,
              isTranslated: false,
              isModified: false,
              isPreTranslated: false,
              lineNumber: 0
            })
          )
        }
      }
    }

    return {
      filePath: ctx.filePath,
      formatId: this.id,
      referenceFilePath: ctx.referenceFilePath,
      metadata: {
        sourceLanguage: ctx.sourceLanguage ?? 'en',
        targetLanguage: ctx.targetLanguage ?? ''
      },
      items,
      stats: computeStats(items)
    }
  }

  async save(catalog: Catalog, options: SaveOptions): Promise<void> {
    // Read existing to preserve key order and indentation
    let indent = 2
    let existingKeys: string[] = []
    try {
      const existing = await readFile(options.filePath, 'utf-8')
      // Detect indentation
      const match = existing.match(/^(\s+)/m)
      if (match) indent = match[1].length
      existingKeys = Object.keys(JSON.parse(existing))
    } catch {
      // File doesn't exist yet or invalid JSON — use catalog order
    }

    // Build output object preserving original key order where possible
    const out: Record<string, string> = {}
    const catalogMap = new Map(catalog.items.map((i) => [i.msgid, i]))

    // First, write keys that existed before (preserving order)
    for (const key of existingKeys) {
      const item = catalogMap.get(key)
      if (item) out[key] = item.translations[0] ?? ''
    }
    // Then any new keys from the catalog
    for (const item of catalog.items) {
      if (!(item.msgid in out)) out[item.msgid] = item.translations[0] ?? ''
    }

    await writeFile(options.filePath, JSON.stringify(out, null, indent) + '\n', 'utf-8')
  }
}
