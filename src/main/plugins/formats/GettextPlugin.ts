import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import type { FileFormatPlugin, OpenContext, SaveOptions, FormatCapabilities } from '@shared/types/plugins'
import type { Catalog, CatalogMetadata } from '@shared/types/catalog'
import { makeItem, computeStats } from '@shared/types/catalog'

/**
 * Gettext PO/POT format plugin.
 * Handles .po and .pot files.
 */
export class GettextPlugin implements FileFormatPlugin {
  readonly id = 'gettext-po'
  readonly displayName = 'Gettext PO'
  readonly extensions = ['po', 'pot']
  readonly capabilities: FormatCapabilities = {
    fuzzyTranslations: true,
    userComments: true,
    plurals: true,
    contextField: true
  }

  /**
   * Raw text blocks per file per item id.
   * Populated during open() so save() can reuse them for unmodified items.
   */
  private rawBlocks = new Map<string, Map<number, string>>()

  /**
   * Verbatim obsolete section (#~ entries) per file.
   * Preserved as-is on save.
   */
  private obsoleteSections = new Map<string, string>()

  /**
   * Raw header block per file (the msgid "" entry + any preceding comments).
   * Preserved on save with only PO-Revision-Date updated.
   */
  private headerBlocks = new Map<string, string>()

  canHandle(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return ext === '.po' || ext === '.pot'
  }

  async open(ctx: OpenContext): Promise<Catalog> {
    const raw = await readFile(ctx.filePath, 'utf-8')
    const lines = raw.split('\n')

    // Capture obsolete section (#~ entries) verbatim so save() can preserve it.
    const firstObsolete = lines.findIndex((l) => l.trimStart().startsWith('#~'))
    if (firstObsolete >= 0) {
      // Trim trailing blank lines but keep everything else as-is.
      let end = lines.length
      while (end > firstObsolete && lines[end - 1].trim() === '') end--
      this.obsoleteSections.set(ctx.filePath, lines.slice(firstObsolete, end).join('\n'))
    } else {
      this.obsoleteSections.delete(ctx.filePath)
    }

    const metadata: CatalogMetadata = {
      sourceLanguage: ctx.sourceLanguage ?? 'en',
      targetLanguage: ctx.targetLanguage ?? ''
    }
    const items: ReturnType<typeof makeItem>[] = []

    // Raw block tracking: accumulate lines for the current entry
    const itemRawBlocks = new Map<number, string>()
    this.rawBlocks.set(ctx.filePath, itemRawBlocks)
    let blockLines: string[] = []

    // PO parser state
    let comment = ''
    const extractedComments: string[] = []
    let references: string[] = []
    let flags: string[] = []
    let context = ''
    let msgid = ''
    let msgidPlural = ''
    let msgstr: string[] = []
    let lineNum = 0
    let inMsgid = false
    let inMsgidPlural = false
    let inMsgstr = false
    let msgstrIndex = 0
    let headerParsed = false
    let hasContent = false // true once a msgid/msgctxt keyword has been seen for this entry
    let id = 1

    const flush = () => {
      // No msgid/msgctxt seen yet — leave blockLines intact so accumulated
      // comment/reference lines carry over to the next entry.
      if (!hasContent) return
      const savedBlock = blockLines.splice(0)
      if (!headerParsed && msgid === '') {
        // Parse header fields from msgstr[0]
        const headerStr = msgstr[0] ?? ''
        for (const line of headerStr.split('\n')) {
          const m = line.match(/^([^:]+):\s*(.+)$/)
          if (m) metadata[m[1].trim()] = m[2].trim()
        }
        if (metadata['Language']) metadata.targetLanguage = metadata['Language']
        // Store the raw header block so save() can preserve it
        this.headerBlocks.set(ctx.filePath, savedBlock.join('\n'))
        headerParsed = true
        resetState()
        return
      }
      const isFuzzy = flags.includes('fuzzy')
      const primaryTranslation = msgstr[0] ?? ''
      const isTranslated = primaryTranslation.trim().length > 0 && !isFuzzy

      const item = makeItem({
        id: id++,
        msgid,
        source: msgid,
        sourcePlural: msgidPlural || undefined,
        translations: msgstr.length > 0 ? [...msgstr] : [''],
        context: context || undefined,
        comment,
        extractedComments: [...extractedComments],
        references: [...references],
        flags: [...flags],
        isFuzzy,
        isTranslated,
        isModified: false,
        isPreTranslated: false,
        lineNumber: lineNum
      })
      items.push(item)
      itemRawBlocks.set(item.id, savedBlock.join('\n'))
      resetState()
    }

    const resetState = () => {
      comment = ''
      extractedComments.length = 0
      references = []
      flags = []
      context = ''
      msgid = ''
      msgidPlural = ''
      msgstr = []
      inMsgid = false
      inMsgidPlural = false
      inMsgstr = false
      msgstrIndex = 0
      hasContent = false
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed === '') {
        flush()
        continue
      }

      if (trimmed.startsWith('#.')) {
        blockLines.push(line)
        extractedComments.push(trimmed.slice(2).trim())
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('#:')) {
        blockLines.push(line)
        const refs = trimmed.slice(2).trim().split(/\s+/).filter(Boolean)
        references.push(...refs)
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('#,')) {
        blockLines.push(line)
        flags = trimmed.slice(2).trim().split(/\s*,\s*/)
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('# ') || trimmed === '#') {
        blockLines.push(line)
        comment += (comment ? '\n' : '') + trimmed.slice(2)
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('#')) {
        blockLines.push(line)
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }

      const msgctxtMatch = trimmed.match(/^msgctxt\s+"(.*)"$/)
      if (msgctxtMatch) {
        flush()
        lineNum = i + 1
        blockLines.push(line)
        context = unescapePO(msgctxtMatch[1])
        hasContent = true
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }

      const msgidMatch = trimmed.match(/^msgid\s+"(.*)"$/)
      if (msgidMatch) {
        if (!context) {
          flush()
          lineNum = i + 1
        }
        blockLines.push(line)
        msgid = unescapePO(msgidMatch[1])
        hasContent = true
        inMsgid = true; inMsgidPlural = false; inMsgstr = false
        continue
      }

      const msgidPluralMatch = trimmed.match(/^msgid_plural\s+"(.*)"$/)
      if (msgidPluralMatch) {
        blockLines.push(line)
        msgidPlural = unescapePO(msgidPluralMatch[1])
        inMsgidPlural = true; inMsgid = false; inMsgstr = false
        continue
      }

      const msgstrMatch = trimmed.match(/^msgstr\s+"(.*)"$/)
      if (msgstrMatch) {
        blockLines.push(line)
        msgstr[0] = unescapePO(msgstrMatch[1])
        inMsgstr = true; msgstrIndex = 0; inMsgid = false; inMsgidPlural = false
        continue
      }

      const msgstrNMatch = trimmed.match(/^msgstr\[(\d+)\]\s+"(.*)"$/)
      if (msgstrNMatch) {
        blockLines.push(line)
        const idx = parseInt(msgstrNMatch[1])
        msgstr[idx] = unescapePO(msgstrNMatch[2])
        inMsgstr = true; msgstrIndex = idx; inMsgid = false; inMsgidPlural = false
        continue
      }

      // Continuation line
      const contMatch = trimmed.match(/^"(.*)"$/)
      if (contMatch) {
        blockLines.push(line)
        const val = unescapePO(contMatch[1])
        if (inMsgid) msgid += val
        else if (inMsgidPlural) msgidPlural += val
        else if (inMsgstr) msgstr[msgstrIndex] = (msgstr[msgstrIndex] ?? '') + val
        continue
      }
    }
    flush()

    return {
      filePath: ctx.filePath,
      formatId: this.id,
      metadata,
      items,
      stats: computeStats(items)
    }
  }

  async save(catalog: Catalog, options: SaveOptions): Promise<void> {
    const rawBlocks = this.rawBlocks.get(catalog.filePath)
    const lines: string[] = []

    // Header entry — preserve the original block, only update PO-Revision-Date
    const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+0000')
    const rawHeader = this.headerBlocks.get(catalog.filePath)
    if (rawHeader) {
      const updatedHeader = rawHeader.replace(
        /^("PO-Revision-Date:).*("\\n")$/m,
        `$1 ${now}$2`,
      )
      lines.push(updatedHeader)
    } else {
      // Fallback for files opened without a stored header (e.g. new files)
      const meta = catalog.metadata
      const headerMsgstr = [
        `Project-Id-Version: ${meta.projectName ?? 'PROJECT'}\\n`,
        `PO-Revision-Date: ${now}\\n`,
        `Language: ${meta.targetLanguage}\\n`,
        `MIME-Version: 1.0\\n`,
        `Content-Type: text/plain; charset=UTF-8\\n`,
        `Content-Transfer-Encoding: 8bit\\n`,
      ].join('')
      lines.push('msgid ""')
      lines.push(`msgstr "${headerMsgstr}"`)
    }
    lines.push('')

    for (const item of catalog.items) {
      // Reuse the original block verbatim if the item hasn't been changed
      if (!item.isModified && rawBlocks?.has(item.id)) {
        lines.push(rawBlocks.get(item.id)!)
        lines.push('')
        continue
      }

      // Regenerate the block for modified (or new) items
      if (item.extractedComments.length > 0) {
        for (const c of item.extractedComments) lines.push(`#. ${c}`)
      }
      for (const ref of item.references) lines.push(`#: ${ref}`)
      if (item.comment) {
        for (const c of item.comment.split('\n')) lines.push(`# ${c}`)
      }
      if (item.flags.length > 0) lines.push(`#, ${item.flags.join(', ')}`)
      if (item.context) lines.push(`msgctxt "${escapePO(item.context)}"`)

      lines.push(`msgid "${escapePO(item.msgid)}"`)

      if (item.sourcePlural) {
        lines.push(`msgid_plural "${escapePO(item.sourcePlural)}"`)
        for (let i = 0; i < item.translations.length; i++) {
          lines.push(`msgstr[${i}] "${escapePO(item.translations[i] ?? '')}"`)
        }
      } else {
        lines.push(`msgstr "${escapePO(item.translations[0] ?? '')}"`)
      }
      lines.push('')
    }

    const obsolete = this.obsoleteSections.get(catalog.filePath)
    if (obsolete) {
      lines.push(obsolete)
      lines.push('')
    }

    await writeFile(options.filePath, lines.join('\n'), 'utf-8')
  }
}

function unescapePO(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function escapePO(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}
