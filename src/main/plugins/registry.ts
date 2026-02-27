/**
 * Plugin Registry - compile-time registration of all format and translator plugins.
 *
 * TO ADD A FILE FORMAT:
 *   1. Create a class in src/main/plugins/formats/ implementing FileFormatPlugin
 *   2. Import it below and add an instance to the `formats` array
 *
 * TO ADD A TRANSLATOR:
 *   1. Create a class in src/main/plugins/translators/ implementing TranslatorPlugin
 *   2. Import it below and add an instance to the `translators` array
 */

import type { PluginRegistry, FileFormatPlugin, TranslatorPlugin } from "../../shared/types/plugins"
import { FormatJsPlugin } from "./formats/FormatJsPlugin"
import { GettextPlugin } from "./formats/GettextPlugin"
import { DeepLPlugin } from "./translators/DeepLPlugin"

const formats: FileFormatPlugin[] = [
  new FormatJsPlugin(),
  new GettextPlugin()
]

const translators: TranslatorPlugin[] = [
  new DeepLPlugin()
]

export const registry: PluginRegistry = {
  formats,
  translators,

  async findFormat(filePath: string): Promise<FileFormatPlugin | undefined> {
    for (const plugin of formats) {
      const result = await Promise.resolve(plugin.canHandle(filePath))
      if (result) return plugin
    }
    return undefined
  },

  getFormat(id: string): FileFormatPlugin | undefined {
    return formats.find((p) => p.id === id)
  },

  async availableTranslators(): Promise<TranslatorPlugin[]> {
    const results: TranslatorPlugin[] = []
    for (const t of translators) {
      const available = await Promise.resolve(t.isAvailable())
      if (available) results.push(t)
    }
    return results
  }
}
