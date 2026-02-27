import { readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import type { FileFormatPlugin, OpenContext, SaveOptions, FormatCapabilities } from '../../../shared/types/plugins'
import type { Catalog } from '../../../shared/types/catalog'
import { makeItem, computeStats } from '../../../shared/types/catalog'

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

  canHandle(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return ext === '.po' || ext === '.pot'
  }

  async open(ctx: OpenContext): Promise<Catalog> {
    const raw = await readFile(ctx.filePath, 'utf-8')
    const lines = raw.split('\n')

    const metadata: Record<string, string> = {
      sourceLanguage: ctx.sourceLanguage ?? 'en',
      targetLanguage: ctx.targetLanguage ?? ''
    }
    const items: ReturnType<typeof makeItem>[] = []

    // PO parser state
    let comment = ''
    const extractedComments: string[] = []
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
    let id = 1

    const flush = () => {
      if (!msgid && !context) return
      if (!headerParsed && msgid === '') {
        // Parse header fields from msgstr[0]
        const headerStr = msgstr[0] ?? ''
        for (const line of headerStr.split('\n')) {
          const m = line.match(/^([^:]+):\s*(.+)$/)
          if (m) metadata[m[1].trim()] = m[2].trim()
        }
        if (metadata['Language']) metadata.targetLanguage = metadata['Language']
        headerParsed = true
        resetState()
        return
      }
      const isFuzzy = flags.includes('fuzzy')
      const primaryTranslation = msgstr[0] ?? ''
      const isTranslated = primaryTranslation.trim().length > 0 && !isFuzzy

      items.push(
        makeItem({
          id: id++,
          msgid,
          source: msgid,
          sourcePlural: msgidPlural || undefined,
          translations: msgstr.length > 0 ? [...msgstr] : [''],
          context: context || undefined,
          comment,
          extractedComments: [...extractedComments],
          flags: [...flags],
          isFuzzy,
          isTranslated,
          isModified: false,
          isPreTranslated: false,
          lineNumber: lineNum
        })
      )
      resetState()
    }

    const resetState = () => {
      comment = ''
      extractedComments.length = 0
      flags = []
      context = ''
      msgid = ''
      msgidPlural = ''
      msgstr = []
      inMsgid = false
      inMsgidPlural = false
      inMsgstr = false
      msgstrIndex = 0
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed === '') {
        flush()
        continue
      }

      if (trimmed.startsWith('#.')) {
        extractedComments.push(trimmed.slice(2).trim())
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('#,')) {
        flags = trimmed.slice(2).trim().split(/\s*,\s*/)
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('# ') || trimmed === '#') {
        comment += (comment ? '\n' : '') + trimmed.slice(2)
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }
      if (trimmed.startsWith('#')) {
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }

      const msgctxtMatch = trimmed.match(/^msgctxt\s+"(.*)"$/)
      if (msgctxtMatch) {
        flush()
        lineNum = i + 1
        context = unescapePO(msgctxtMatch[1])
        inMsgid = inMsgidPlural = inMsgstr = false
        continue
      }

      const msgidMatch = trimmed.match(/^msgid\s+"(.*)"$/)
      if (msgidMatch) {
        if (!context) { flush(); lineNum = i + 1 }
        msgid = unescapePO(msgidMatch[1])
        inMsgid = true; inMsgidPlural = false; inMsgstr = false
        continue
      }

      const msgidPluralMatch = trimmed.match(/^msgid_plural\s+"(.*)"$/)
      if (msgidPluralMatch) {
        msgidPlural = unescapePO(msgidPluralMatch[1])
        inMsgidPlural = true; inMsgid = false; inMsgstr = false
        continue
      }

      const msgstrMatch = trimmed.match(/^msgstr\s+"(.*)"$/)
      if (msgstrMatch) {
        msgstr[0] = unescapePO(msgstrMatch[1])
        inMsgstr = true; msgstrIndex = 0; inMsgid = false; inMsgidPlural = false
        continue
      }

      const msgstrNMatch = trimmed.match(/^msgstr\[(\d+)\]\s+"(.*)"$/)
      if (msgstrNMatch) {
        const idx = parseInt(msgstrNMatch[1])
        msgstr[idx] = unescapePO(msgstrNMatch[2])
        inMsgstr = true; msgstrIndex = idx; inMsgid = false; inMsgidPlural = false
        continue
      }

      // Continuation line
      const contMatch = trimmed.match(/^"(.*)"$/)
      if (contMatch) {
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
    const lines: string[] = []

    // Write header entry
    const meta = catalog.metadata
    const now = new Date().toISOString()
    const headerMsgstr = [
      `Project-Id-Version: ${meta.projectName ?? 'PROJECT'}\\n`,
      `PO-Revision-Date: ${now}\\n`,
      `Language: ${meta.targetLanguage}\\n`,
      `MIME-Version: 1.0\\n`,
      `Content-Type: text/plain; charset=UTF-8\\n`,
      `Content-Transfer-Encoding: 8bit\\n`
    ].join('')

    lines.push('msgid ""')
    lines.push(`msgstr "${headerMsgstr}"`)
    lines.push('')

    for (const item of catalog.items) {
      if (item.extractedComments.length > 0) {
        for (const c of item.extractedComments) lines.push(`#. ${c}`)
      }
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
