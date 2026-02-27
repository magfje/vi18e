import { ipcMain } from "electron"
import { IPC } from "../../shared/ipc/channels"
import type { PreferencesData } from "../../shared/types/ipc"
import { PreferencesStore } from "../store/PreferencesStore"

export function registerPrefsHandlers(): void {
  ipcMain.handle(IPC.PREFS_GET, () => PreferencesStore.get())
  ipcMain.handle(IPC.PREFS_SET, (_event, data: Partial<PreferencesData>) => {
    PreferencesStore.set(data)
  })
}
