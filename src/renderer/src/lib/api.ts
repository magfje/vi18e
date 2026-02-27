import { IPC } from '../../../shared/ipc/channels'
import type {
  OpenFileRequest,
  OpenFileResponse,
  SaveFileRequest,
  SaveFileResponse,
  ShowOpenDialogRequest,
  ShowOpenDialogResponse,
  TMQueryRequest,
  TMQueryResponse,
  TMInsertRequest,
  TMDeleteRequest,
  TMImportRequest,
  TMImportResponse,
  TMStatsResponse,
  TranslateRequest,
  TranslateResponse,
  AvailableTranslatorsResponse,
  DeepLUsageResponse,
  PreferencesData,
  RecentFile
} from '../../../shared/types/ipc'

declare global {
  interface Window {
    api: {
      invoke: <Res = unknown>(channel: string, payload?: unknown) => Promise<Res>
      on: (channel: string, handler: (payload: unknown) => void) => () => void
    }
  }
}

export const api = {
  file: {
    openDialog: (req: ShowOpenDialogRequest) =>
      window.api.invoke<ShowOpenDialogResponse>(IPC.FILE_OPEN_DIALOG, req),
    open: (req: OpenFileRequest) =>
      window.api.invoke<OpenFileResponse>(IPC.FILE_OPEN, req),
    save: (req: SaveFileRequest) =>
      window.api.invoke<SaveFileResponse>(IPC.FILE_SAVE, req),
    recentList: () =>
      window.api.invoke<RecentFile[]>(IPC.FILE_RECENT_LIST),
    onOpened: (handler: (catalog: OpenFileResponse['catalog']) => void) =>
      window.api.on(IPC.FILE_OPENED, handler as (p: unknown) => void)
  },

  tm: {
    query: (req: TMQueryRequest) =>
      window.api.invoke<TMQueryResponse>(IPC.TM_QUERY, req),
    insert: (req: TMInsertRequest) =>
      window.api.invoke<void>(IPC.TM_INSERT, req),
    delete: (req: TMDeleteRequest) =>
      window.api.invoke<void>(IPC.TM_DELETE, req),
    import: (req: TMImportRequest) =>
      window.api.invoke<TMImportResponse>(IPC.TM_IMPORT, req),
    stats: () =>
      window.api.invoke<TMStatsResponse>(IPC.TM_STATS),
    clear: () =>
      window.api.invoke<void>(IPC.TM_CLEAR)
  },

  translate: {
    query: (req: TranslateRequest) =>
      window.api.invoke<TranslateResponse>(IPC.TRANSLATE_QUERY, req),
    available: () =>
      window.api.invoke<AvailableTranslatorsResponse>(IPC.TRANSLATE_AVAILABLE),
    usage: () =>
      window.api.invoke<DeepLUsageResponse | null>(IPC.TRANSLATE_USAGE)
  },

  prefs: {
    get: () =>
      window.api.invoke<PreferencesData>(IPC.PREFS_GET),
    set: (data: Partial<PreferencesData>) =>
      window.api.invoke<void>(IPC.PREFS_SET, data)
  }
}
