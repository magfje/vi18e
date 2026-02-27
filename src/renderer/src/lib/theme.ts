import type { AppTheme } from '../../../shared/types/ipc'

export type { AppTheme }

// ---------------------------------------------------------------------------
// Module-level singleton for the system prefers-color-scheme listener.
// Kept outside React so it survives component unmounts / re-renders.
// ---------------------------------------------------------------------------

let _systemMq: MediaQueryList | null = null
let _systemHandler: ((e: MediaQueryListEvent) => void) | null = null

function clearSystemListener(): void {
  if (_systemMq && _systemHandler) {
    _systemMq.removeEventListener('change', _systemHandler)
    _systemMq = null
    _systemHandler = null
  }
}

/**
 * Apply the given theme to the document root and set up (or tear down) the
 * system media-query listener as needed.
 *
 * Safe to call from anywhere — always cleans up the previous listener first.
 */
export function applyTheme(theme: AppTheme): void {
  clearSystemListener()

  const root = document.documentElement

  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // 'system' — apply current preference and watch for future changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    root.classList.toggle('dark', mq.matches)

    _systemMq = mq
    _systemHandler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    _systemMq.addEventListener('change', _systemHandler)
  }
}
