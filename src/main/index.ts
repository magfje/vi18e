import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { IPC } from "../shared/ipc/channels";
import { registerFileHandlers } from "./ipc/fileHandlers";
import { registerPrefsHandlers } from "./ipc/prefsHandlers";
import { registerTMHandlers } from "./ipc/tmHandlers";
import { registerTranslateHandlers } from "./ipc/translateHandlers";

// Suppress the default Electron menu (Edit/View/Window/Help) — it initializes
// at startup even when hidden, wasting CPU. We use a fully custom frameless UI.
Menu.setApplicationMenu(null);

function logError(err: unknown): void {
  try {
    const logDir = app.isReady() ? app.getPath("userData") : app.getAppPath();
    mkdirSync(logDir, { recursive: true });
    const msg = `[${new Date().toISOString()}] ${String(err)}\n${err instanceof Error ? err.stack ?? "" : ""}\n`;
    appendFileSync(join(logDir, "error.log"), msg);
  } catch { /* ignore logging errors */ }
}

process.on("uncaughtException", (err) => {
  logError(err);
  dialog.showErrorBox("Startup error", String(err));
});

process.on("unhandledRejection", (reason) => {
  logError(reason);
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 1000,
    minWidth: 800,
    minHeight: 800,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    title: "v(i18)e",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: false,
      contextIsolation: true,
      // Keep the renderer responsive even when the window is in the background
      // (e.g. user is typing in another app while a translation is being fetched).
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  // Window control handlers
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => mainWindow.minimize());
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle(IPC.WINDOW_CLOSE, () => mainWindow.close());

  // Notify renderer when maximize state changes
  mainWindow.on("maximize", () =>
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, true),
  );
  mainWindow.on("unmaximize", () =>
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, false),
  );

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env["VITE_DEV_SERVER_URL"]) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Cache compiled V8 bytecode between sessions — measurably faster cold starts
  // after the first launch (the cache is built on first run, used on all subsequent).
  session.defaultSession.setCodeCachePath(
    join(app.getPath("userData"), "v8-cache")
  );

  try {
    registerFileHandlers();
    registerTMHandlers();
    registerTranslateHandlers();
    registerPrefsHandlers();
  } catch (err) {
    logError(err);
    dialog.showErrorBox("Startup error", String(err));
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
