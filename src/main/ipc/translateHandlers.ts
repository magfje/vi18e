import { ipcMain } from "electron"
import { IPC } from "../../shared/ipc/channels"
import type { TranslateRequest, TranslateResponse, AvailableTranslatorsResponse } from "../../shared/types/ipc"
import { sortSuggestions } from "../../shared/utils/scoring"
import { registry } from "../plugins/registry"

export function registerTranslateHandlers(): void {
  ipcMain.handle(IPC.TRANSLATE_QUERY, async (_event, req: TranslateRequest) => {
    const available = await registry.availableTranslators()
    const plugin = req.pluginId
      ? available.find((p) => p.id === req.pluginId)
      : available[0]

    if (!plugin) return { suggestions: [], source: "" } satisfies TranslateResponse

    const suggestions = await plugin.suggest({
      sourceLanguage: req.sourceLanguage,
      targetLanguage: req.targetLanguage,
      sourceText: req.sourceText,
      context: req.context
    })

    return {
      suggestions: sortSuggestions(suggestions),
      source: plugin.displayName
    } satisfies TranslateResponse
  })

  ipcMain.handle(IPC.TRANSLATE_AVAILABLE, async () => {
    const available = await registry.availableTranslators()
    return {
      plugins: available.map((p) => ({ id: p.id, displayName: p.displayName }))
    } satisfies AvailableTranslatorsResponse
  })
}
