const { app, BrowserWindow, shell, ipcMain, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { spawn } = require('child_process')
const { requestAzureDevOps } = require('./azure-devops.cjs')
const { checkForUpdate, downloadUpdate } = require('./desktop-update.cjs')
const distDir = path.join(__dirname, '..', 'dist')
const bundledUrl = pathToFileURL(path.join(distDir, 'index.html')).href
const trustedSender = (event) => {
  const source = event.senderFrame?.url, devUrl = process.env.VITE_DEV_SERVER_URL
  return event.senderFrame === event.sender.mainFrame && (source === bundledUrl || Boolean(devUrl && source && new URL(source).origin === new URL(devUrl).origin))
}

ipcMain.handle('app-update:reload', (event) => {
  const source = event.senderFrame?.url, devUrl = process.env.VITE_DEV_SERVER_URL
  if (event.senderFrame !== event.sender.mainFrame || !(source === bundledUrl || (devUrl && source && new URL(source).origin === new URL(devUrl).origin))) throw new Error('Untrusted update request.')
  setImmediate(() => { if (!event.sender.isDestroyed()) event.sender.reloadIgnoringCache() })
})

// Desktop update: check the published build, then download, verify and start the installer for this platform.
ipcMain.handle('desktop-update:check', async (event) => {
  if (!trustedSender(event)) throw new Error('Untrusted update request.')
  return checkForUpdate((url, options) => net.fetch(url, options), distDir)
})
let installing = false
ipcMain.handle('desktop-update:install', async (event) => {
  if (!trustedSender(event)) throw new Error('Untrusted update request.')
  if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Updates from the app are available on Windows and macOS only.')
  if (installing) throw new Error('An update is already downloading.')
  installing = true
  try {
    let last = 0
    const result = await downloadUpdate((url, options) => net.fetch(url, options), distDir, path.join(app.getPath('temp'), 'demand-planning-hub-update'), (received, total) => {
      const percent = Math.floor(received / total * 100)
      if (percent !== last && !event.sender.isDestroyed()) { last = percent; event.sender.send('desktop-update:progress', { received, total }) }
    })
    if (process.platform === 'win32') {
      // The installer replaces the app files; saved data and PATs live in the user profile and are kept.
      spawn(result.path, [], { detached: true, stdio: 'ignore' }).unref()
      setTimeout(() => app.quit(), 800)
      return { status: 'installer-started', buildNumber: result.buildNumber }
    }
    const error = await shell.openPath(result.path)
    if (error) throw new Error(`The disk image was downloaded to ${result.path} but could not be opened: ${error}`)
    return { status: 'disk-image-opened', buildNumber: result.buildNumber }
  } finally { installing = false }
})

ipcMain.handle('azure-devops:request', async (event, request) => {
  const source = event.senderFrame?.url
  const devUrl = process.env.VITE_DEV_SERVER_URL
  const trusted = source === bundledUrl || (devUrl && source && new URL(source).origin === new URL(devUrl).origin)
  if (!trusted || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted request source.')
  // Chromium's network stack: uses the Windows certificate store and system proxy (needed for on-prem servers).
  return requestAzureDevOps(request, (url, options) => net.fetch(url, options))
})

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f2f5f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) window.loadURL(devUrl)
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
