import { existsSync, mkdirSync } from 'node:fs'
import { join, parse } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { closeDb, getDb } from './db'
import { attachDevHarness, prepareHarness } from './devharness'
import { resumeJobs } from './generation'
import { registerIpc } from './ipc'
import { handleStudioProtocol, registerSchemes } from './protocol'
import { warmUpEncryption } from './secrets'

/**
 * Where projects, the database, the Whisper model and saved keys live. Rendered videos and images are
 * large, so the folder sits on a roomy drive instead of the Windows app-data folder, which is often on a
 * nearly full C:. Override it with STUDIO_DATA_DIR; the app falls back to app-data when the drive is gone.
 */
const PREFERRED_DATA = process.env.STUDIO_DATA_DIR || 'F:\\Kisara'
app.setName('Kisara')

/**
 * Reuse existing profiles in place: Chromium's Local State must stay beside the database so saved API
 * keys remain readable. Compatibility paths are not product branding and must not be renamed blindly.
 */
function useDataFolder(): void {
  if (!app.isPackaged && process.env.STUDIO_USER_DATA) return app.setPath('userData', process.env.STUDIO_USER_DATA)

  const appData = app.getPath('appData')
  const existing = [
    ...(process.env.STUDIO_DATA_DIR ? [process.env.STUDIO_DATA_DIR] : []),
    'F:\\storybot',
    'F:\\Kisara',
    join(appData, 'Kisara'),
    join(appData, 'Bang Story'),
    join(appData, 'Studio Cerita')
  ].find((dir) => existsSync(join(dir, 'studio.db')))
  if (existing && !process.env.STUDIO_DATA_DIR) return app.setPath('userData', existing)

  // Only use the preferred folder when its drive is actually present, so an unplugged drive cannot
  // silently start an empty second library.
  if (PREFERRED_DATA && existsSync(parse(PREFERRED_DATA).root)) {
    mkdirSync(PREFERRED_DATA, { recursive: true })
    return app.setPath('userData', PREFERRED_DATA)
  }

  app.setPath('userData', existing ?? join(appData, 'Kisara'))
}

useDataFolder()
prepareHarness()
// Windows hands videos to hardware overlays that snap their size and position to whole pixels, so a slow
// camera move over a video trembles while the same move over a still is smooth. Draw videos like images.
app.commandLine.appendSwitch('disable-direct-composition-video-overlays')

registerSchemes()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#FAF7F2',
    autoHideMenuBar: true,
    title: 'Kisara',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())
  attachDevHarness(win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file://')) e.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const single = app.requestSingleInstanceLock()
if (!single) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('id.kisara.desktop')
    warmUpEncryption()
    getDb()
    handleStudioProtocol()
    registerIpc()
    createWindow()
    resumeJobs()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => closeDb())
}
