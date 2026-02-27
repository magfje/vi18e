import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import type { FileFormatPlugin, OpenContext, SaveOptions, FormatCapabilities } from '../../../shared/types/plugins'
import type { Catalog } from '../../../shared/types/catalog'
import { makeItem, computeStats } from '../../../shared/types/catalog'

/**
 * Format.js (react-intl) JSON format plugin.
 *
 * Pairs a source/reference file (extracted, has defaultMessage + description):
 *   { "app.greeting": { "defaultMessage": "Hello {name}!", "description": "..." } }
 *
 * with a translation file (compiled, key → string):
 *   { "app.greeting": "Hallo {name}!" }
 *
 * The user edits the translation file. The reference file provides source text.
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

    // Load reference (source) file if provided
    let referenceData: Record<string, { defaultMessage?: string; description?: string }> = {}
    if (ctx.referenceFilePath) {
      const refRaw = await readFile(ctx.referenceFilePath, 'utf-8')
      referenceData = JSON.parse(refRaw)
    }

    let id = 1
    const items = Object.entries(translationData).map(([key, value]) => {
      const ref = referenceData[key]
      const source =
        ref?.defaultMessage ??
        (typeof value === 'object' && value !== null && 'defaultMessage' in value
          ? String((value as Record<string, unknown>).defaultMessage)
          : key)

      const translation =
        typeof value === 'string'
          ? value
          : typeof value === 'object' && value !== null && 'defaultMessage' in value
            ? '' // source file opened directly — no translation yet
            : ''

      const extractedComments: string[] = []
      if (ref?.description) extractedComments.push(ref.description)

      const isTranslated = translation.trim().length > 0

      return makeItem({
        id: id++,
        msgid: key,
        source,
        translations: [translation],
        comment: '',
        extractedComments,
        flags: [],
        isFuzzy: false,
        isTranslated,
        isModified: false,
        isPreTranslated: false,
        lineNumber: 0
      })
    })

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
