import { ipcMain } from "electron"
import { IPC } from "../../shared/ipc/channels"
import type { TranslateRequest, TranslateResponse, AvailableTranslatorsResponse } from "../../shared/types/ipc"
import { sortSuggestions } from "../../shared/utils/scoring"
import { registry } from "../plugins/registry"

export function registerTranslateHandlers(): void {
  ipcMain.handle(IPC.TRANSLATE_QUERY, async (_event, req: TranslateRequest) => {
    console.log('[translate:query]', {
      text: req.sourceText?.slice(0, 60),
      src: req.sourceLanguage,
      tgt: req.targetLanguage,
      pluginId: req.pluginId
    })

    const available = await registry.availableTranslators()
    console.log('[translate:query] available plugins:', available.map((p) => p.id))

    const plugin = req.pluginId
      ? available.find((p) => p.id === req.pluginId)
      : available[0]

    if (!plugin) {
      console.log('[translate:query] no plugin available → returning empty')
      return { suggestions: [], source: "" } satisfies TranslateResponse
    }

    console.log(`[translate:query] calling ${plugin.id}.suggest()`)
    const suggestions = await plugin.suggest({
      sourceLanguage: req.sourceLanguage,
      targetLanguage: req.targetLanguage,
      sourceText: req.sourceText,
      context: req.context
    })

    console.log(`[translate:query] ${plugin.displayName} returned ${suggestions.length} suggestion(s)`)
    return {
      suggestions: sortSuggestions(suggestions),
      source: plugin.displayName
    } satisfies TranslateResponse
  })

  ipcMain.handle(IPC.TRANSLATE_AVAILABLE, async () => {
    const available = await registry.availableTranslators()
    console.log('[translate:available]', available.map((p) => p.id))
    return {
      plugins: available.map((p) => ({ id: p.id, displayName: p.displayName }))
    } satisfies AvailableTranslatorsResponse
  })

  ipcMain.handle(IPC.TRANSLATE_USAGE, async () => {
    const deepl = registry.translators.find((p) => p.id === 'deepl')
    if (!deepl?.getUsage) return null
    return deepl.getUsage()
  })
}
