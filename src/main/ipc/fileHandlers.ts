import { ipcMain, dialog } from "electron"
import { readFile, readdir } from "fs/promises"
import { dirname, basename, extname, join } from "path"
import { IPC } from "../../shared/ipc/channels"
import type {
  OpenFileRequest,
  OpenFileResponse,
  SaveFileRequest,
  SaveFileResponse,
  ShowOpenDialogRequest,
  ShowOpenDialogResponse
} from "../../shared/types/ipc"
import { registry } from "../plugins/registry"
import { computeStats } from "../../shared/types/catalog"
import { PreferencesStore } from "../store/PreferencesStore"

// ---------------------------------------------------------------------------
// Auto-detection helpers for Format.js JSON files
// ---------------------------------------------------------------------------

/**
 * Preferred source-file names, in priority order.
 * The first one found in the same directory wins.
 */
const SOURCE_CANDIDATES = [
  'en.json',
  'en-US.json',
  'en_US.json',
  'en-us.json',
  'en-gb.json',
  'en-GB.json'
]

/**
 * Infer BCP-47 language code from a filename like "nb.json", "fr-FR.json", "zh_CN.json".
 * Returns undefined if the basename doesn't look like a language tag.
 */
function inferLanguage(filePath: string): string | undefined {
  const base = basename(filePath, extname(filePath))
  // Match: xx  /  xx-YY  /  xx_YY
  if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(base) || /^[a-z]{2,3}_[A-Za-z]{2,4}$/.test(base)) {
    return base.replace('_', '-')
  }
  return undefined
}

/**
 * Return true if `filePath` is a Format.js source file —
 * i.e. its JSON values are objects with a "defaultMessage" key.
 * Reads only enough to check the first entry.
 */
async function isFormatJsSourceFile(filePath: string): Promise<boolean> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    const values = Object.values(data)
    // Need at least one entry that looks like { defaultMessage: "..." }
    return values
      .slice(0, 10)
      .some(
        (v) =>
          typeof v === 'object' &&
          v !== null &&
          'defaultMessage' in (v as object) &&
          typeof (v as Record<string, unknown>).defaultMessage === 'string'
      )
  } catch {
    return false
  }
}

/**
 * Return true if `filePath` is a Format.js *translation* file —
 * i.e. its JSON values are plain strings (not source-file objects).
 */
async function isFormatJsTranslationFile(filePath: string): Promise<boolean> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    const values = Object.values(data)
    if (values.length === 0) return false
    // Must have at least some string values
    const stringCount = values.filter((v) => typeof v === 'string').length
    return stringCount / values.length > 0.5
  } catch {
    return false
  }
}

/**
 * Given a JSON file path, try to find its Format.js source/reference file.
 *
 * Strategy:
 *  1. If the file itself is a source file (has defaultMessage) → no reference needed,
 *     but we also try to find a sibling translation file to be aware of.
 *  2. If the file is a translation file → scan sibling JSON files for the source.
 *     Preferred names: en.json, en-US.json, …
 *     Fall back to any sibling that isFormatJsSourceFile().
 *
 * Returns an enriched OpenFileRequest with referenceFilePath / languages filled in.
 */
async function autoDetectJsonContext(req: OpenFileRequest): Promise<OpenFileRequest> {
  const { filePath } = req

  // Don't override an explicit referenceFilePath
  if (req.referenceFilePath) return req

  const dir = dirname(filePath)
  const targetLang = inferLanguage(filePath)

  // Is the opened file itself a source file?
  if (await isFormatJsSourceFile(filePath)) {
    // Opened the source (en.json) directly — no reference needed.
    // Infer source language from filename and return.
    return {
      ...req,
      sourceLanguage: req.sourceLanguage ?? targetLang ?? 'en',
      // no referenceFilePath — the plugin handles defaultMessage values inline
    }
  }

  // It looks like a translation file — search for the source file.
  let siblings: string[]
  try {
    const entries = await readdir(dir)
    siblings = entries.filter((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    return req
  }

  // 1. Check preferred candidate names first (case-insensitive)
  for (const candidate of SOURCE_CANDIDATES) {
    const match = siblings.find((s) => s.toLowerCase() === candidate.toLowerCase())
    if (!match) continue
    const candidatePath = join(dir, match)
    if (candidatePath === filePath) continue
    if (await isFormatJsSourceFile(candidatePath)) {
      return {
        ...req,
        referenceFilePath: candidatePath,
        sourceLanguage: req.sourceLanguage ?? inferLanguage(candidatePath) ?? 'en',
        targetLanguage: req.targetLanguage ?? targetLang
      }
    }
  }

  // 2. Fall back: any sibling that is a source file
  for (const sibling of siblings) {
    const candidatePath = join(dir, sibling)
    if (candidatePath === filePath) continue
    if (await isFormatJsSourceFile(candidatePath)) {
      return {
        ...req,
        referenceFilePath: candidatePath,
        sourceLanguage: req.sourceLanguage ?? inferLanguage(candidatePath) ?? 'en',
        targetLanguage: req.targetLanguage ?? targetLang
      }
    }
  }

  // 3. No source file found — at least fill in the language from the filename
  return {
    ...req,
    targetLanguage: req.targetLanguage ?? targetLang
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerFileHandlers(): void {
  ipcMain.handle(IPC.FILE_RECENT_LIST, () => {
    return PreferencesStore.getRecentFiles()
  })

  ipcMain.handle(IPC.FILE_OPEN_DIALOG, async (_event, req: ShowOpenDialogRequest) => {
    const result = await dialog.showOpenDialog({
      title: req.title,
      filters: req.filters,
      properties: req.multipleFiles ? ["openFile", "multiSelections"] : ["openFile"]
    })
    return {
      filePaths: result.filePaths,
      cancelled: result.canceled
    } satisfies ShowOpenDialogResponse
  })

  ipcMain.handle(IPC.FILE_OPEN, async (_event, req: OpenFileRequest) => {
    try {
      const plugin = await registry.findFormat(req.filePath)
      if (!plugin) {
        return { error: `No plugin found for file: ${req.filePath}` } satisfies OpenFileResponse
      }

      // Auto-detect companion source file for Format.js JSON files
      const enrichedReq =
        plugin.id === 'formatjs-json'
          ? await autoDetectJsonContext(req)
          : req

      const catalog = await plugin.open({
        filePath: enrichedReq.filePath,
        referenceFilePath: enrichedReq.referenceFilePath,
        targetLanguage: enrichedReq.targetLanguage,
        sourceLanguage: enrichedReq.sourceLanguage
      })

      // Track in recent files
      PreferencesStore.pushRecentFile({
        filePath: req.filePath,
        formatId: plugin.id,
        targetLanguage: catalog.metadata.targetLanguage,
        lastOpenedAt: Date.now()
      })

      return { catalog } satisfies OpenFileResponse
    } catch (e) {
      return { error: String(e) } as OpenFileResponse
    }
  })

  ipcMain.handle(IPC.FILE_SAVE, async (_event, req: SaveFileRequest) => {
    try {
      const plugin = registry.getFormat(req.catalog.formatId)
      if (!plugin) return { success: false, error: "Unknown format" } satisfies SaveFileResponse
      // Recompute stats before saving
      req.catalog.stats = computeStats(req.catalog.items)
      await plugin.save(req.catalog, {
        filePath: req.targetPath ?? req.catalog.filePath
      })
      return { success: true } satisfies SaveFileResponse
    } catch (e) {
      return { success: false, error: String(e) } satisfies SaveFileResponse
    }
  })
}
