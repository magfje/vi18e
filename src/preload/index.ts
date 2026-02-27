import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <Res = unknown>(channel: string, payload?: unknown): Promise<Res> =>
    ipcRenderer.invoke(channel, payload),
  on: (channel: string, handler: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => handler(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
