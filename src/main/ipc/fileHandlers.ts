import { ipcMain, dialog } from "electron"
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
      const catalog = await plugin.open({
        filePath: req.filePath,
        referenceFilePath: req.referenceFilePath,
        targetLanguage: req.targetLanguage,
        sourceLanguage: req.sourceLanguage
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
