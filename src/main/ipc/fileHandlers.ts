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
// Auto-detection helpers for JSON translation files
// ---------------------------------------------------------------------------

/**
 * Preferred source-locale filenames, in priority order.
 * Any of these found as a sibling will be used as the reference file.
 */
const SOURCE_LOCALE_NAMES = [
  'en.json',
  'en-US.json',
  'en_US.json',
  'en-us.json',
  'en-gb.json',
  'en-GB.json'
]

/**
 * Infer a BCP-47 language code from a filename like:
 *   nb.json → "nb"
 *   fr-FR.json → "fr-FR"
 *   zh_CN.json → "zh-CN"   (underscore normalised to hyphen)
 * Returns undefined if the filename doesn't look like a locale tag.
 */
function inferLanguage(filePath: string): string | undefined {
  const base = basename(filePath, extname(filePath))
  // Match: xx  /  xxx  /  xx-YY  /  xxx-YY  /  xx_YY  /  xxx_YY
  if (
    /^[a-z]{2,3}$/.test(base) ||
    /^[a-z]{2,3}[-_][A-Za-z]{2,4}$/.test(base)
  ) {
    return base.replace('_', '-')
  }
  return undefined
}

/**
 * Return true when the filename (case-insensitive) matches one of the known
 * source-locale names.  Used to avoid treating en.json as a translation file
 * when the user explicitly opens it.
 */
function looksLikeSourceLocale(filePath: string): boolean {
  const name = basename(filePath).toLowerCase()
  return SOURCE_LOCALE_NAMES.map((n) => n.toLowerCase()).includes(name)
}

/**
 * Return true when the file is valid JSON whose values are mostly plain strings.
 * This covers both flat-string translation files AND the flat-string source locale
 * (the user's en.json).  Does NOT require defaultMessage objects.
 */
async function isFlatStringJson(filePath: string): Promise<boolean> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    const values = Object.values(data)
    if (values.length === 0) return false
    const stringCount = values.filter((v) => typeof v === 'string').length
    return stringCount / values.length >= 0.8
  } catch {
    return false
  }
}

/**
 * Return true when the file looks like a Format.js *extraction* source —
 * i.e. values are objects with a "defaultMessage" string property.
 * This is the older/alternative workflow where you use the extraction output
 * as the reference instead of a plain locale file.
 */
async function isDefaultMessageJson(filePath: string): Promise<boolean> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    const values = Object.values(data)
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
 * Given a JSON file, resolve the best reference/source file and infer languages.
 *
 * Two reference-file formats are supported:
 *  A) Flat locale files  (user's setup):   { "key": "English string" }
 *  B) Extraction output  (older workflow):  { "key": { "defaultMessage": "..." } }
 *
 * Detection order for the reference:
 *  1. If the opened file itself is in SOURCE_LOCALE_NAMES — it IS the source,
 *     no companion needed (infer source language from filename).
 *  2. Look for a sibling in SOURCE_LOCALE_NAMES that is flat-string JSON (format A).
 *  3. Look for any sibling that is defaultMessage JSON (format B).
 *  4. Give up — at least infer the target language from the filename.
 */
async function autoDetectJsonContext(req: OpenFileRequest): Promise<OpenFileRequest> {
  const { filePath } = req

  // Don't override an explicit referenceFilePath provided by the caller
  if (req.referenceFilePath) return req

  const targetLang = inferLanguage(filePath)

  // Case 1 — the opened file IS the source locale (user opened en.json directly)
  if (looksLikeSourceLocale(filePath)) {
    return {
      ...req,
      sourceLanguage: req.sourceLanguage ?? targetLang ?? 'en'
    }
  }

  // Case 2 & 3 — scan sibling JSON files for a reference
  const dir = dirname(filePath)
  let siblings: string[]
  try {
    siblings = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    return { ...req, targetLanguage: req.targetLanguage ?? targetLang }
  }

  // Priority A: a sibling whose name matches a known source-locale name (flat strings)
  for (const candidate of SOURCE_LOCALE_NAMES) {
    const match = siblings.find((s) => s.toLowerCase() === candidate.toLowerCase())
    if (!match) continue
    const candidatePath = join(dir, match)
    if (candidatePath === filePath) continue
    if (await isFlatStringJson(candidatePath)) {
      return {
        ...req,
        referenceFilePath: candidatePath,
        sourceLanguage: req.sourceLanguage ?? inferLanguage(candidatePath) ?? 'en',
        targetLanguage: req.targetLanguage ?? targetLang
      }
    }
  }

  // Priority B: any sibling with defaultMessage objects (extraction format)
  for (const sibling of siblings) {
    const candidatePath = join(dir, sibling)
    if (candidatePath === filePath) continue
    if (await isDefaultMessageJson(candidatePath)) {
      return {
        ...req,
        referenceFilePath: candidatePath,
        sourceLanguage: req.sourceLanguage ?? inferLanguage(candidatePath) ?? 'en',
        targetLanguage: req.targetLanguage ?? targetLang
      }
    }
  }

  // No reference found — at least record the target language
  return { ...req, targetLanguage: req.targetLanguage ?? targetLang }
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

      // Auto-detect companion source file for JSON files
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
