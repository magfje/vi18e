import { app, BrowserWindow, shell, ipcMain } from "electron";
import { join } from "path";
import { registerFileHandlers } from "./ipc/fileHandlers";
import { registerPrefsHandlers } from "./ipc/prefsHandlers";
import { registerTMHandlers } from "./ipc/tmHandlers";
import { registerTranslateHandlers } from "./ipc/translateHandlers";
import { IPC } from "../shared/ipc/channels";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    title: "v(i18)e",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  // Window control handlers
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => mainWindow.minimize())
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, () => mainWindow.close())

  // Notify renderer when maximize state changes
  mainWindow.on('maximize', () => mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, false))

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
  // Register all IPC handlers
  registerFileHandlers();
  registerTMHandlers();
  registerTranslateHandlers();
  registerPrefsHandlers();

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
