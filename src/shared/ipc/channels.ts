/**
 * IPC channel name constants.
 * All renderer→main calls use ipcRenderer.invoke() via contextBridge.
 * Main→renderer pushes use ipcRenderer.on() (marked with ← below).
 */

export const IPC = {
  // File operations
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',
  FILE_RECENT_LIST: 'file:recent-list',
  /** ← Push from main when user opens a file via OS association or menu */
  FILE_OPENED: 'file:opened',

  // Translation Memory
  TM_QUERY: 'tm:query',
  TM_INSERT: 'tm:insert',
  TM_DELETE: 'tm:delete',
  TM_IMPORT: 'tm:import-catalog',
  TM_STATS: 'tm:stats',
  TM_CLEAR: 'tm:clear-all',

  // Translator plugins
  TRANSLATE_QUERY: 'translate:query',
  TRANSLATE_AVAILABLE: 'translate:available',
  TRANSLATE_USAGE: 'translate:usage',

  // Preferences
  PREFS_GET: 'prefs:get',
  PREFS_SET: 'prefs:set',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  /** ← Push from main when maximize state changes */
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed'
} as const

