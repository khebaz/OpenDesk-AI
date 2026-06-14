const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')
const { execSync } = require('child_process')
const ModelManager = require('./model-manager')
const InferenceEngine = require('./inference-engine')
const RamMonitor = require('./ram-monitor')
const ApiServer = require('./api-server')
const IdleManager = require('./idle-manager')
const { checkForUpdates } = require('./updater')
const { RAM_POLL_INTERVAL } = require('../shared/constants')

let mainWindow
let childBrowser = null
const modelManager = new ModelManager()
const engine       = new InferenceEngine()
const ramMonitor   = new RamMonitor()
const apiServer    = new ApiServer(engine)
const idleManager  = new IdleManager(engine, () => modelManager.getSettings())

function openChildBrowser(url) {
  if (childBrowser && !childBrowser.isDestroyed()) {
    childBrowser.loadURL(url)
    childBrowser.focus()
    return
  }
  childBrowser = new BrowserWindow({
    width: 800, height: 600,
    parent: mainWindow,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  childBrowser.loadURL(url)
  childBrowser.on('closed', () => { childBrowser = null })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 660,
    minWidth: 800, minHeight: 560,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../assets/icon.ico'),
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(async () => {
  createWindow()
  await modelManager.init()
  apiServer.start(modelManager.getSettings().apiPort || 11434)

  // RAM polling
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ram-update', ramMonitor.read())
    }
  }, RAM_POLL_INTERVAL)

  // Check for updates after 5 s (non-blocking)
  setTimeout(() => checkForUpdates(mainWindow), 5000)
})

app.on('window-all-closed', () => {
  idleManager.cancelAll()
  engine.stopAll()
  apiServer.stop()
  app.quit()
})

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('models:list', () => modelManager.list())

ipcMain.handle('models:download', async (event, modelId) => {
  return modelManager.download(modelId, (progress) => {
    event.sender.send('models:download-progress', { modelId, progress })
  })
})

ipcMain.handle('models:cancel-download', (_, modelId) => modelManager.cancelDownload(modelId))
ipcMain.handle('models:delete',          (_, modelId) => modelManager.delete(modelId))

ipcMain.handle('engine:launch', async (_, modelId) => {
  const model = modelManager.get(modelId)
  if (!model) return { ok: false, error: 'Model not found or not downloaded yet.' }

  // Enforce RAM ceiling
  const settings   = modelManager.getSettings()
  const running    = engine.status()
  const usedRam    = running.reduce((s, m) => s + m.ramGb, 0)
  const osBaseline = 0.4
  if (usedRam + model.ramGb + osBaseline > settings.ramCeilingGb) {
    return { ok: false, error: `Not enough RAM. This model needs ${model.ramGb} GB but only ${(settings.ramCeilingGb - usedRam - osBaseline).toFixed(1)} GB is free.` }
  }

  const result = await engine.launch(model, settings)
  if (result.ok) idleManager.activity(modelId)
  return result
})

ipcMain.handle('engine:stop', (_, modelId) => {
  idleManager.cancel(modelId)
  return engine.stop(modelId)
})

ipcMain.handle('engine:status', () => engine.status())

ipcMain.handle('engine:chat', async (event, { modelId, messages, options }) => {
  idleManager.activity(modelId)
  return engine.chat(modelId, messages, options, (token) => {
    event.sender.send('engine:token', { modelId, token })
  })
})

ipcMain.handle('settings:get',  ()            => modelManager.getSettings())
ipcMain.handle('settings:save', (_, settings) => modelManager.saveSettings(settings))

// RAM boost
ipcMain.handle('ram:heavy-processes', () => {
  try {
    const out = execSync(
      `powershell "Get-Process | Where-Object { $_.WorkingSet64 -gt 100MB -and $_.ProcessName -notmatch '^(System|Idle|svchost|csrss|wininit|services|lsass|smss|spoolsv|SecurityHealth|sihost|taskhostw|RuntimeBroker|StartMenuExperienceHost|SearchIndexer|widgets|TextInputHost|ShellExperienceHost|ctfmon)$' } | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 ProcessName,@{N='MB';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"`,
      { encoding: 'utf8', timeout: 5000 }
    )
    return JSON.parse(out)
  } catch (_) { return [] }
})

ipcMain.handle('exec:cmd', (_, cmd) => {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', timeout: 15000 }
    )
    return out.toString()
  } catch (_) { return '' }
})

// File system
ipcMain.handle('fs:select-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('fs:list-dir', async (_, dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries.map(e => ({
    name: e.name,
    isDir: e.isDirectory(),
    size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : 0,
  })).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

ipcMain.handle('fs:read-file', (_, filePath) => {
  const stat = fs.statSync(filePath)
  if (stat.size > 1024 * 1024) {
    throw new Error('File too large (>1MB)')
  }
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('fs:write-file', (_, { filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return { ok: true }
})

// Window controls
ipcMain.on('window:minimize', () => mainWindow.minimize())
ipcMain.on('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.on('window:close',    () => mainWindow.close())
ipcMain.on('open-url',           (_, url) => openChildBrowser(url))
ipcMain.on('open-child-browser', (_, url) => openChildBrowser(url))
