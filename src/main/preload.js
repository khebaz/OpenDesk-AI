const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Models
  listModels:          ()           => ipcRenderer.invoke('models:list'),
  downloadModel:       (id)         => ipcRenderer.invoke('models:download', id),
  cancelDownload:      (id)         => ipcRenderer.invoke('models:cancel-download', id),
  deleteModel:         (id)         => ipcRenderer.invoke('models:delete', id),

  // Engine
  launchModel:         (id)         => ipcRenderer.invoke('engine:launch', id),
  stopModel:           (id)         => ipcRenderer.invoke('engine:stop', id),
  engineStatus:        ()           => ipcRenderer.invoke('engine:status'),
  chat:                (id, msgs, opts) => ipcRenderer.invoke('engine:chat', { modelId: id, messages: msgs, options: opts }),

  // Settings
  getSettings:         ()           => ipcRenderer.invoke('settings:get'),
  saveSettings:        (s)          => ipcRenderer.invoke('settings:save', s),

  // Events
  onRamUpdate:         (cb)         => ipcRenderer.on('ram-update', (_, d) => cb(d)),
  onDownloadProgress:  (cb)         => ipcRenderer.on('models:download-progress', (_, d) => cb(d)),
  onToken:             (cb)         => ipcRenderer.on('engine:token', (_, d) => cb(d)),

  // Remove a listener (pass the same function reference)
  removeListener:      (ch, cb)     => ipcRenderer.removeListener(ch, cb),

  // Window controls
  minimize:            ()           => ipcRenderer.send('window:minimize'),
  maximize:            ()           => ipcRenderer.send('window:maximize'),
  close:               ()           => ipcRenderer.send('window:close'),

  openUrl:             (url)        => ipcRenderer.send('open-url', url),
  openChildBrowser:    (url)        => ipcRenderer.send('open-child-browser', url),

  // RAM
  heavyProcesses:      ()           => ipcRenderer.invoke('ram:heavy-processes'),
  execCmd:             (cmd)        => ipcRenderer.invoke('exec:cmd', cmd),

  // File system
  selectDir:           ()           => ipcRenderer.invoke('fs:select-dir'),
  selectFiles:         ()           => ipcRenderer.invoke('fs:select-files'),
  listDir:             (dirPath)    => ipcRenderer.invoke('fs:list-dir', dirPath),
  readFile:            (filePath)   => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile:           (filePath, content) => ipcRenderer.invoke('fs:write-file', { filePath, content }),
})
