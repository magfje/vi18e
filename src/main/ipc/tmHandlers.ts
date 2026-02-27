import { ipcMain } from "electron"
import { IPC } from "../../shared/ipc/channels"
import type {
  TMQueryRequest,
  TMQueryResponse,
  TMInsertRequest,
  TMDeleteRequest,
  TMImportRequest,
  TMImportResponse,
  TMStatsResponse
} from "../../shared/types/ipc"
import { TranslationMemory } from "../tm/TranslationMemory"

export function registerTMHandlers(): void {
  ipcMain.handle(IPC.TM_QUERY, (_event, req: TMQueryRequest) => {
    const suggestions = TranslationMemory.get().query(
      req.sourceLanguage,
      req.targetLanguage,
      req.sourceText,
      req.limit
    )
    return { suggestions } satisfies TMQueryResponse
  })

  ipcMain.handle(IPC.TM_INSERT, (_event, req: TMInsertRequest) => {
    TranslationMemory.get().upsert(
      req.sourceLanguage,
      req.targetLanguage,
      req.sourceText,
      req.translation
    )
  })

  ipcMain.handle(IPC.TM_DELETE, (_event, req: TMDeleteRequest) => {
    TranslationMemory.get().delete(req.id)
  })

  ipcMain.handle(IPC.TM_IMPORT, (_event, req: TMImportRequest) => {
    const inserted = TranslationMemory.get().importCatalog(req.catalog)
    return { inserted } satisfies TMImportResponse
  })

  ipcMain.handle(IPC.TM_STATS, () => {
    return TranslationMemory.get().stats() satisfies TMStatsResponse
  })

  ipcMain.handle(IPC.TM_CLEAR, () => {
    TranslationMemory.get().clearAll()
  })
}
