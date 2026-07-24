import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpc, setPreviewWindow } from './ipc'

let mainWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1f26',
    title: 'StoryForge',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 打开 / 聚焦独立预览窗口 */
export function openPreviewWindow(): BrowserWindow {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus()
    return previewWindow
  }

  previewWindow = new BrowserWindow({
    width: 960,
    height: 600,
    title: 'StoryForge 预览',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const query = '?mode=preview'
  if (isDev) {
    previewWindow.loadURL((process.env['ELECTRON_RENDERER_URL'] as string) + query)
  } else {
    previewWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      search: 'mode=preview'
    })
  }

  previewWindow.on('closed', () => {
    previewWindow = null
    setPreviewWindow(null)
  })

  setPreviewWindow(previewWindow)
  return previewWindow
}

app.whenReady().then(() => {
  registerIpc({ openPreviewWindow, getMainWindow: () => mainWindow })
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
