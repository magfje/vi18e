/**
 * BCP-47 language code helpers.
 */

/** Extract the base language code from a BCP-47 tag e.g. "en-US" → "en", "zh_CN" → "zh" */
export function baseLanguage(code: string): string {
  return code.split(/[-_]/)[0].toLowerCase()
}

/** Convert a BCP-47 code ("en_US") to uppercase base ("EN") for DeepL source */
export function toDeepLSourceCode(code: string): string {
  return baseLanguage(code).toUpperCase()
}

/**
 * Convert to DeepL target language code.
 * DeepL requires specific regional variants for some languages.
 */
export function toDeepLTargetCode(code: string): string {
  const base = baseLanguage(code).toUpperCase()
  const overrides: Record<string, string> = {
    EN: 'EN-US',
    PT: 'PT-PT',
    ZH: 'ZH-HANS'
  }
  return overrides[base] ?? base
}
