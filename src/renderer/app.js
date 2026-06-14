/**
 * OpenDesk AI renderer — app.js
 * Handles all UI pages, IPC calls to main process, and real-time updates.
 */

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  models:        [],
  runningIds:    new Set(),
  settings:      {},
  currentPage:   'home',
  chatHistory:   [],          // { role, content }[]
  activeChatId:  null,        // modelId currently used for chat
}

function safeId(id) {
  return id.replace(/\./g, '-')
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadData()
  bindNav()
  renderHome()
  renderLibrary()
  renderSettings()
  renderFiles()
  renderChat()

  // RAM updates from main process
  window.api.onRamUpdate(data => updateRamBar(data))

  // Download progress
  window.api.onDownloadProgress(({ modelId, progress }) => {
    updateDownloadModal(modelId, progress)
  })

  // Streaming tokens
  window.api.onToken(({ token }) => appendToken(token))

  // Status bar chat button
  document.getElementById('btn-open-chat').addEventListener('click', () => {
    navigateTo('chat')
  })

  // Titlebar buttons
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize())
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize())
  document.getElementById('close-btn').addEventListener('click', () => window.api.close())

  // Support buttons — open in internal child browser
  document.getElementById('btn-coffee').addEventListener('click', () => window.api.openChildBrowser('https://paypal.me/KhebazPromotions'))
  document.getElementById('btn-whatsapp').addEventListener('click', () => window.api.openChildBrowser('https://wa.me/26778612619'))

  // RAM boost
  document.getElementById('btn-boost-ram').addEventListener('click', boostRam)
})

async function loadData() {
  state.models   = await window.api.listModels()
  state.settings = await window.api.getSettings()
  const running  = await window.api.engineStatus()
  state.runningIds = new Set(running.map(r => r.modelId))
}

// ── Navigation ────────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page))
  })
}

function navigateTo(page) {
  state.currentPage = page
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page)
  })
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === 'page-' + page)
  })
  const titles = { home: 'Models', chat: 'Code chat', library: 'Add models', files: 'Files', settings: 'Settings' }
  document.getElementById('page-title').textContent = titles[page] || ''
}

// ── RAM boost ─────────────────────────────────────────────────────────────────
async function boostRam() {
  const procs = await window.api.heavyProcesses()
  if (!procs || (Array.isArray(procs) && !procs.length) || (!Array.isArray(procs) && !procs.ProcessName)) {
    appendSystemMsg('⚡ No heavy apps found to close.')
    return
  }
  const list = Array.isArray(procs) ? procs : [procs]
  const msg = 'Close these apps to free RAM?\n' + list.map(p => `  • ${p.ProcessName} (${p.MB} MB)`).join('\n')
  if (confirm(msg)) {
    for (const p of list) {
      try { await window.api.execCmd(`taskkill /f /im ${p.ProcessName}.exe`) } catch (_) {}
    }
    appendSystemMsg(`⚡ Closed ${list.length} app(s) to free memory.`)
  }
}

// ── RAM bar ───────────────────────────────────────────────────────────────────
function updateRamBar({ usedGb, totalGb, pct, warning }) {
  const fill = document.getElementById('bar-fill')
  fill.style.width = pct + '%'
  fill.style.background = pct > 88 ? '#b91c1c' : pct > 70 ? '#b45309' : '#1a6b3c'
  document.getElementById('ram-txt').textContent  = `${usedGb} / ${totalGb} GB`
  document.getElementById('ram-note').textContent = warning
    ? '⚠ Near limit — close other apps'
    : pct > 70 ? 'Running tight' : 'Healthy'
}

// ── Home page ─────────────────────────────────────────────────────────────────
function renderHome() {
  const primary = state.models.find(m => m.role === 'primary')
  const addons  = state.models.filter(m => m.role === 'addon' && m.installed)
  const heroModel = primary?.installed ? primary : addons[0]
  const isRunning = state.runningIds.has(heroModel?.id)
  const page    = document.getElementById('page-home')

  page.innerHTML = `
    ${heroCardHtml(heroModel, isRunning)}

    <div class="sec-lbl">Active add-ons <span style="font-size:10px;background:var(--bg2);border:0.5px solid var(--border);border-radius:10px;padding:1px 6px;text-transform:none;letter-spacing:0;color:var(--text2);font-weight:400;margin-left:4px">${addons.length} loaded</span></div>
    <div id="addon-list">${addons.map(m => addonRowHtml(m, state.runningIds.has(m.id))).join('')}</div>
    <button class="add-btn" id="add-model-btn">＋ Add a lightweight model</button>

    <div class="sec-lbl" style="margin-top:4px">Status</div>
    <div class="hint-box" id="status-hint">ℹ Launch a model above to start coding.</div>
  `

  page.querySelector('#add-model-btn')?.addEventListener('click', () => navigateTo('library'))

  if (heroModel) {
    if (!isRunning) {
      page.querySelector('#btn-launch-primary')?.addEventListener('click', () => launchModel(heroModel.id))
    } else {
      page.querySelector('#btn-stop-primary')?.addEventListener('click', () => stopModel(heroModel.id))
    }
  }

  addons.forEach(m => {
    const rid = safeId(m.id)
    page.querySelector(`#launch-${rid}`)?.addEventListener('click', () => launchModel(m.id))
    page.querySelector(`#stop-${rid}`)?.addEventListener('click', () => stopModel(m.id))
    page.querySelector(`#remove-${rid}`)?.addEventListener('click', () => removeAddon(m.id))
  })

  updateStatusBar()
}

function heroCardHtml(m, isRunning) {
  if (!m) return '<p>No models downloaded yet. Go to <strong>Add models</strong> to get started.</p>'

  let actionHtml
  if (!isRunning) {
    actionHtml = `<button class="btn-primary" id="btn-launch-primary">▶ Launch model</button>`
  } else {
    actionHtml = `<button class="btn-stop" id="btn-stop-primary">■ Stop</button>
                  <button class="btn-primary" disabled style="opacity:.4;cursor:default;margin-left:6px">▶ Running</button>`
  }

  return `
    <div class="hero-card">
      <div class="hero-l">
        <div class="hero-badge">★ ${m.role === 'primary' ? 'Primary model' : 'Active model'}</div>
        <div class="hero-name">${m.name}</div>
        <div class="hero-desc">${m.description}</div>
        <div class="stats">
          <div class="stat"><div class="stat-n">${m.ramGb} GB</div><div class="stat-l">RAM usage</div></div>
          <div class="stat"><div class="stat-n">~14 t/s</div><div class="stat-l">CPU speed</div></div>
          <div class="stat"><div class="stat-n">${m.tags.length > 2 ? '40+' : (m.paramB || '?') + 'B'}</div><div class="stat-l">Languages</div></div>
          <div class="stat"><div class="stat-n">${m.quant}</div><div class="stat-l">Quant</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">${actionHtml}</div>
      </div>
      <div class="hero-r">
        <div class="hero-icon">⌨</div>
        <div class="hero-status ${isRunning ? 'running' : 'idle'}" id="hero-running-status">
          ${isRunning ? '● Running' : 'Idle'}
        </div>
      </div>
    </div>
  `
}

function addonRowHtml(m, isRunning) {
  const actionBtn = isRunning
    ? `<button class="btn-sm btn-stop-sm" id="stop-${safeId(m.id)}">■ Stop</button>`
    : `<button class="btn-sm btn-launch-sm" id="launch-${safeId(m.id)}">▶ Launch</button>`
  return `
    <div class="mc loaded">
      <div class="mc-ico" style="background:${m._bg||'#e6f4ed'};color:${m._tc||'#1a6b3c'}">${m._icon||'📦'}</div>
      <div style="flex:1;min-width:0">
        <div class="mc-name">${m.name}</div>
        <div class="mc-sub">${m.ramGb} GB · ${isRunning ? 'Running' : 'Loaded'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${actionBtn}
        <button class="btn-sm" id="remove-${safeId(m.id)}" style="color:#b91c1c;border-color:#f09595" title="Remove model">✕</button>
      </div>
    </div>
  `
}

// ── Launch / Stop ─────────────────────────────────────────────────────────────
async function launchModel(modelId) {
  const result = await window.api.launchModel(modelId)
  if (result.ok) {
    state.runningIds.add(modelId)
    state.activeChatId = modelId
    state.chatHistory = []
    setEngineStatus(true)
  }
  renderHome()
  const hint = document.getElementById('status-hint')
  if (hint) {
    if (result.ok) {
      hint.innerHTML = `✓ ${state.models.find(m => m.id === modelId)?.name || modelId} running — <a href="#" id="go-chat" style="color:var(--acc)">open code chat →</a>`
      document.getElementById('go-chat')?.addEventListener('click', e => { e.preventDefault(); navigateTo('chat') })
    } else {
      hint.innerHTML = `⚠ Launch failed: ${result.error}`
    }
  }
}

async function stopModel(modelId) {
  await window.api.stopModel(modelId)
  state.runningIds.delete(modelId)
  if (state.activeChatId === modelId) state.activeChatId = null
  setEngineStatus(state.runningIds.size > 0)
  renderHome()
}

async function removeAddon(modelId) {
  await window.api.stopModel(modelId)
  await window.api.deleteModel(modelId)
  state.runningIds.delete(modelId)
  const m = state.models.find(x => x.id === modelId)
  if (m) m.installed = false
  renderHome()
  renderLibrary()
}

function setEngineStatus(on) {
  document.getElementById('engine-dot').className = 'dot' + (on ? ' on' : '')
  document.getElementById('engine-txt').textContent = on ? 'Engine active' : 'Engine idle'
}

function setHint(html) {
  const el = document.getElementById('status-hint')
  if (el) el.innerHTML = html
}

function updateStatusBar() {
  const running = state.models.filter(m => state.runningIds.has(m.id))
  const btn = document.getElementById('btn-open-chat')
  const lbl = document.getElementById('status-model')
  if (running.length) {
    lbl.textContent = running.map(m => m.name).join(', ') + ' · running'
    btn.disabled = false
  } else {
    lbl.textContent = 'No model running'
    btn.disabled = true
  }
}

// ── Library page ──────────────────────────────────────────────────────────────
function renderLibrary() {
  const page   = document.getElementById('page-library')
  const addons = state.models.filter(m => m.role === 'addon')

  page.innerHTML = `
    <div class="cat-label">⌨ Coding add-ons — all fit in 4 GB alongside primary</div>
    <div class="lib-grid">
      ${addons.map(libCardHtml).join('')}
    </div>
  `

  addons.forEach(m => {
    if (!m.installed) {
      page.querySelector(`#btn-lib-${safeId(m.id)}`)?.addEventListener('click', () => {
        downloadModel(m.id)
      })
    }
  })
}

function libCardHtml(m) {
  const colors = {
    'qwen2.5-coder-1.5b': { bg: '#e6f4ed', tc: '#1a6b3c', icon: '↔' },
    'qwen2.5-coder-0.5b': { bg: '#EAE6FF', tc: '#5C3DDB', icon: '⚡' },
    'phi-3.5-mini':        { bg: '#E6F1FB', tc: '#185FA5', icon: '📖' },
    'starcoder2-3b':       { bg: '#fef3c7', tc: '#b45309', icon: '★' },
    'deepseek-coder-1.3b': { bg: '#FAECE7', tc: '#993C1D', icon: '∫' },
  }
  const c = colors[m.id] || { bg: '#e6f4ed', tc: '#1a6b3c', icon: '📦' }
  m._bg = c.bg; m._tc = c.tc; m._icon = c.icon  // cache for addon row

  const tagHtml = m.tags.slice(0,1).map(t => `<span class="tag tag-g" style="font-size:10px">${t}</span>`).join('')

  return `
    <div class="lib-card ${m.installed ? 'inst' : ''}">
      <div class="lc-head">
        <div class="lc-ico" style="background:${c.bg};color:${c.tc}">${c.icon}</div>
        <span class="lc-name">${m.name}</span>
      </div>
      <div class="lc-desc">${m.description}</div>
      <div class="lc-foot">
        <div class="lc-sz">💾 ${m.ramGb} GB</div>
        ${m.installed
          ? `<button class="btn-add inst" disabled>✓ Added</button>`
          : `<button class="btn-add" id="btn-lib-${safeId(m.id)}">Add</button>`}
      </div>
    </div>
  `
}

// ── Download ──────────────────────────────────────────────────────────────────
function downloadModel(modelId) {
  const m = state.models.find(x => x.id === modelId)
  if (!m) return

  // Show modal
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = `dl-overlay-${safeId(modelId)}`
  overlay.innerHTML = `
    <div class="modal">
      <h3>Downloading ${m.name}</h3>
      <p>${m.name} ${m.quant} GGUF · ${m.ramGb} GB · from Hugging Face</p>
      <div id="prog-sub-${safeId(modelId)}" style="font-size:11px;color:var(--text2);margin-bottom:6px">Connecting to Hugging Face...</div>
      <div class="prog-bg"><div class="prog-fill" id="prog-fill-${safeId(modelId)}"></div></div>
      <div class="prog-lbl" id="prog-lbl-${safeId(modelId)}">0%</div>
      <div class="modal-btns">
        <button class="btn-sm" id="cancel-dl-${safeId(modelId)}">Cancel</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById(`cancel-dl-${safeId(modelId)}`)?.addEventListener('click', () => {
    window.api.cancelDownload(modelId)
    overlay.remove()
  })

  window.api.downloadModel(modelId).then(result => {
    overlay.remove()
    if (result?.ok) {
      const model = state.models.find(x => x.id === modelId)
      if (model) model.installed = true
      renderHome()
      renderLibrary()
    } else if (result?.error) {
      overlay.remove()
      appendSystemMsg('Download failed: ' + result.error)
    }
  }).catch(err => {
    overlay.remove()
  })
}

function updateDownloadModal(modelId, progress) {
  const fill = document.getElementById(`prog-fill-${safeId(modelId)}`)
  const lbl  = document.getElementById(`prog-lbl-${safeId(modelId)}`)
  const sub  = document.getElementById(`prog-sub-${safeId(modelId)}`)
  if (fill) fill.style.width = progress + '%'
  if (lbl)  lbl.textContent  = progress + '%'
  if (sub)  sub.textContent  = progress < 1 ? 'Connecting to Hugging Face...' : `Downloading... ${progress}% complete`
}

// ── Files page ────────────────────────────────────────────────────────────────
let _fsRoot = null
let _fsOpenFile = null

async function renderFiles() {
  const page = document.getElementById('page-files')
  page.innerHTML = `
    <div id="files-toolbar">
      <button class="btn-sm" id="btn-open-folder">📂 Open folder</button>
      <span id="files-path">${_fsRoot || 'No folder opened'}</span>
    </div>
    <div id="files-panels">
      <div id="files-tree"></div>
      <div id="files-editor">
        <div id="files-editor-empty">Select a file to view or edit</div>
        <textarea id="files-editor-text" spellcheck="false"></textarea>
        <div id="files-editor-bar">
          <span id="files-editor-name"></span>
          <button class="btn-sm" id="btn-save-file">💾 Save</button>
        </div>
      </div>
    </div>
  `

  document.getElementById('btn-open-folder')?.addEventListener('click', async () => {
    const dir = await window.api.selectDir()
    if (dir) {
      _fsRoot = dir
      document.getElementById('files-path').textContent = dir
      await renderFileTree(dir)
    }
  })

  document.getElementById('btn-save-file')?.addEventListener('click', async () => {
    if (!_fsOpenFile) return
    const content = document.getElementById('files-editor-text').value
    await window.api.writeFile(_fsOpenFile, content)
    const btn = document.getElementById('btn-save-file')
    btn.textContent = '✓ Saved'
    setTimeout(() => { btn.textContent = '💾 Save' }, 1500)
  })

  if (_fsRoot) {
    document.getElementById('files-path').textContent = _fsRoot
    await renderFileTree(_fsRoot)
  }
}

async function renderFileTree(dirPath) {
  const tree = document.getElementById('files-tree')
  tree.innerHTML = '<div class="ft-loading">Loading...</div>'
  try {
    const entries = await window.api.listDir(dirPath)
    tree.innerHTML = entries.map(e => `
      <div class="ft-entry ${e.isDir ? 'ft-dir' : 'ft-file'}" data-path="${dirPath}\\${e.name}" data-isdir="${e.isDir}">
        <span class="ft-icon">${e.isDir ? '📁' : getFileIcon(e.name)}</span>
        <span class="ft-name">${e.name}</span>
        ${e.isDir ? '' : `<span class="ft-size">${formatSize(e.size)}</span>`}
      </div>
    `).join('')

    tree.querySelectorAll('.ft-entry').forEach(el => {
      el.addEventListener('click', async () => {
        const entryPath = el.dataset.path
        if (el.dataset.isdir === 'true') {
          await renderFileTree(entryPath)
        } else {
          await openFile(entryPath)
        }
      })
    })
  } catch (err) {
    tree.innerHTML = `<div class="ft-error">Error: ${err.message}</div>`
  }
}

async function openFile(filePath) {
  _fsOpenFile = filePath
  document.getElementById('files-editor-empty').style.display = 'none'
  document.getElementById('files-editor-text').style.display = 'block'
  document.getElementById('files-editor-bar').style.display = 'flex'
  document.getElementById('files-editor-name').textContent = filePath.split('\\').pop()
  try {
    const content = await window.api.readFile(filePath)
    document.getElementById('files-editor-text').value = content
  } catch (err) {
    document.getElementById('files-editor-text').value = `Error reading file: ${err.message}`
  }
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  const icons = {
    js: '📜', ts: '📘', jsx: '⚛', tsx: '⚛',
    html: '🌐', css: '🎨', json: '📋', md: '📝',
    py: '🐍', rs: '🦀', go: '🔷', java: '☕',
    c: '⚙', cpp: '⚙', h: '⚙', cs: '💠',
    vue: '💚', svelte: '🧡', yaml: '📄', yml: '📄',
    toml: '📄', xml: '📄', sql: '🗃', sh: '💻',
    bat: '💻', ps1: '💻', txt: '📄',
  }
  return icons[ext] || '📄'
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

// ── System prompt for tool-using agent ────────────────────────────────────────
const SYSTEM_PROMPT = `You are OpenDesk AI, a local coding assistant on Windows. You help write, debug, refactor, and explain code. You operate fully OFFLINE with no internet access.

The user can attach files to messages — their content is shown to you directly. Read and answer questions about attached files without using tools.

When the user asks you to interact with their system (list files, run commands, edit files on disk), use these tags:

<cmd>PowerShell command</cmd> — run a command. Example: <cmd>Get-ChildItem $env:USERPROFILE\\Desktop</cmd>
<read>C:\\path\\to\\file</read> — read a file from disk
<list>C:\\path\\to\\dir</list> — list a directory
<write path="C:\\path\\to\\file">content</write> — write or overwrite a file

Rules:
- Only use tags when the user explicitly asks for file system actions
- For attached files, just answer directly — no tags needed
- When told to edit a file on disk, first <read> it, then <write> the changes
- One tag per line. Be concise.`

// ── Chat page ─────────────────────────────────────────────────────────────────
let _attachedFiles = []

function renderChat() {
  const page = document.getElementById('page-chat')
  const activeModel = state.models.find(m => state.runningIds.has(m.id))
  const welcomeName = activeModel?.name || 'a model'
  page.innerHTML = `
    <div id="chat-messages">
      <div class="msg">
        <div class="msg-avatar ai">Q</div>
        <div class="msg-bubble">Hi! I'm <strong>${welcomeName}</strong> running locally on your machine.
Ask me to write, debug, refactor, or explain code — what are you working on?</div>
      </div>
    </div>
    <div id="chat-attachments"></div>
    <div id="chat-input-bar">
      <button id="btn-attach" title="Select files">📎</button>
      <button id="btn-attach-folder" title="Add all files from a folder">📁</button>
      <input type="text" id="chat-input" placeholder="Write me a function that…" />
      <button id="btn-send">↑</button>
    </div>
  `

  const input = document.getElementById('chat-input')
  const btn   = document.getElementById('btn-send')
  const attach = document.getElementById('btn-attach')
  const attachFolder = document.getElementById('btn-attach-folder')

  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage() })
  btn.addEventListener('click', sendMessage)
  attach.addEventListener('click', attachFiles)
  attachFolder.addEventListener('click', attachFolderFiles)
}

async function attachFiles() {
  const files = await window.api.selectFiles()
  if (!files || !files.length) return
  for (const filePath of files) {
    await addAttachedFile(filePath)
  }
  renderAttachments()
}

async function attachFolderFiles() {
  const dir = await window.api.selectDir()
  if (!dir) return
  const entries = await window.api.listDir(dir)
  for (const e of entries) {
    if (!e.isDir) {
      await addAttachedFile(dir + '\\' + e.name)
    }
  }
  renderAttachments()
}

async function addAttachedFile(filePath) {
  if (_attachedFiles.find(f => f.path === filePath)) return
  try {
    let content = await window.api.readFile(filePath)
    const name = filePath.split('\\').pop()
    if (content.length > 4000) {
      content = content.slice(0, 4000) + '\n\n... (truncated, file too large)'
    }
    _attachedFiles.push({ path: filePath, name, content })
  } catch (_) {
    _attachedFiles.push({ path: filePath, name: filePath.split('\\').pop() + ' (error reading)', content: '' })
  }
}

function renderAttachments() {
  const container = document.getElementById('chat-attachments')
  if (!container) return
  if (!_attachedFiles.length) { container.innerHTML = ''; return }
  container.innerHTML = _attachedFiles.map((f, i) =>
    `<div class="att-file"><span class="att-name">📄 ${f.name}</span><button class="att-remove" data-idx="${i}">✕</button></div>`
  ).join('')
  container.querySelectorAll('.att-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _attachedFiles.splice(parseInt(btn.dataset.idx), 1)
      renderAttachments()
    })
  })
}

let _streamTarget = null

const TOOL_TAG_RE = /<(cmd|read|list)>([\s\S]*?)<\/(?:cmd|read|list)>|<write\s+path="([^"]*)">([\s\S]*?)<\/write>/g

function parseToolCalls(text) {
  const calls = []
  let match
  TOOL_TAG_RE.lastIndex = 0
  while ((match = TOOL_TAG_RE.exec(text)) !== null) {
    if (match[1] === 'cmd') {
      calls.push({ type: 'cmd', arg: match[2].trim() })
    } else if (match[1] === 'read') {
      calls.push({ type: 'read', arg: match[2].trim() })
    } else if (match[1] === 'list') {
      calls.push({ type: 'list', arg: match[2].trim() })
    } else if (match[3] !== undefined) {
      calls.push({ type: 'write', arg: match[3], content: match[4] })
    }
  }
  return calls
}

async function executeToolCall(call) {
  try {
    switch (call.type) {
      case 'cmd': {
        const out = await window.api.execCmd(call.arg)
        return `[TOOL RESULT - cmd]\n$ ${call.arg}\n${out || '(no output)'}\n[/TOOL RESULT]`
      }
      case 'read': {
        try {
          const content = await window.api.readFile(call.arg)
          return `[TOOL RESULT - read]\nFile: ${call.arg}\n\n${content}\n[/TOOL RESULT]`
        } catch (e) {
          return `[TOOL RESULT - read error]\nFile: ${call.arg}\nError: ${e.message}\n[/TOOL RESULT]`
        }
      }
      case 'list': {
        const entries = await window.api.listDir(call.arg)
        const lines = entries.map(e =>
          `${e.isDir ? '[DIR]' : '[FILE]'} ${e.name}${e.isDir ? '' : ' (' + formatSize(e.size) + ')'}`
        ).join('\n')
        return `[TOOL RESULT - list]\nDirectory: ${call.arg}\n\n${lines}\n[/TOOL RESULT]`
      }
      case 'write': {
        await window.api.writeFile(call.arg, call.content)
        return `[TOOL RESULT - write]\nFile written: ${call.arg} (${call.content.length} bytes)\n[/TOOL RESULT]`
      }
      default:
        return `[TOOL RESULT - unknown tool: ${call.type}]`
    }
  } catch (e) {
    return `[TOOL RESULT - error]\nTool ${call.type} failed: ${e.message}\n[/TOOL RESULT]`
  }
}

async function sendMessage() {
  const input = document.getElementById('chat-input')
  const text  = input.value.trim()
  if (!text) return
  input.value = ''

  const modelId = state.activeChatId || [...state.runningIds][0]
  if (!modelId) {
    appendSystemMsg('⚠ No model is running. Launch a model from the Models page first.')
    return
  }

  let fullText = text
  if (_attachedFiles.length) {
    const ctx = _attachedFiles.map(f =>
      `--- ${f.name} ---\n${f.content}\n--- end ${f.name} ---`
    ).join('\n\n')
    fullText = `I'm working with these files:\n\n${ctx}\n\n${text}`
  }
  state.chatHistory.push({ role: 'user', content: fullText })
  appendMessage('user', text)

  // Tool loop with max iterations
  let messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...state.chatHistory,
  ]
  let finalContent = ''
  let toolCallsFound = false
  const TOOL_MAX_ITER = 5

  for (let iter = 0; iter < TOOL_MAX_ITER; iter++) {
    const typingId = 'typing-' + Date.now()
    appendTyping(typingId)
    _streamTarget = { id: typingId, content: '' }

    try {
      await window.api.chat(modelId, messages, { maxTokens: 512, temperature: 0.2 })
    } catch (err) {
      removeTyping(typingId)
      if (!finalContent) appendSystemMsg('⚠ Chat error: ' + (err.message || err))
      _streamTarget = null
      return
    }

    const responseContent = _streamTarget.content
    _streamTarget = null

    // Parse tool calls
    const calls = parseToolCalls(responseContent)
    const cleanText = responseContent.replace(TOOL_TAG_RE, '').trim()

    if (calls.length === 0) {
      // No tool calls — this is the final response
      finalContent = cleanText || responseContent
      const typingEl = document.getElementById(typingId)
      if (typingEl) {
        const bubble = typingEl.querySelector('.msg-bubble')
        bubble.innerHTML = `<div class="msg-text">${formatCode(finalContent)}</div>
          <button class="btn-copy" title="Copy message">📋</button>`
        bubble.querySelector('.btn-copy').addEventListener('click', () => {
          navigator.clipboard.writeText(finalContent)
          const btn = bubble.querySelector('.btn-copy')
          btn.textContent = '✓'
          setTimeout(() => { btn.textContent = '📋' }, 1500)
        })
      }
      // Save only the clean text (no tool tags) to chat history
      if (iter === 0) {
        state.chatHistory.push({ role: 'assistant', content: finalContent })
      }
      scrollChat()
      return
    }

    // Tool calls detected — execute them
    toolCallsFound = true
    const resultLines = [`_🔧 Executing ${calls.length} tool call(s)..._\n`]

    // Show clean text in the typing bubble before executing tools
    const typingEl = document.getElementById(typingId)
    if (typingEl && cleanText) {
      typingEl.querySelector('.msg-bubble').innerHTML = formatCode(cleanText) + '\n\n_⚡ Running tools..._'
    }

    for (const call of calls) {
      const result = await executeToolCall(call)
      resultLines.push(result)
      messages.push({ role: 'assistant', content: `<${call.type}>...` })
      messages.push({ role: 'system', content: result })
    }

    // Append tool results as system message for next iteration
    messages.push({ role: 'system', content: resultLines.join('\n\n') })

    // Remove the typing indicator from the previous iteration
    removeTyping(typingId)
  }

  // If we exhausted iterations with tool calls still happening
  if (toolCallsFound) {
    appendSystemMsg('⚠ Reached maximum tool call iterations. Response may be incomplete.')
  }
}

function appendToken(token) {
  if (!_streamTarget) return
  _streamTarget.content += token
  const el = document.getElementById(_streamTarget.id)
  if (el) el.querySelector('.msg-bubble').innerHTML = formatCode(_streamTarget.content) + '<span style="opacity:.4">▌</span>'
  scrollChat()
}

function appendMessage(role, content) {
  const msgs = document.getElementById('chat-messages')
  const div  = document.createElement('div')
  div.className = `msg ${role}`
  div.innerHTML = `
    <div class="msg-avatar ${role}">${role === 'ai' ? 'Q' : '👤'}</div>
    <div class="msg-bubble">
      <div class="msg-text">${formatCode(content)}</div>
      <button class="btn-copy" title="Copy message">📋</button>
    </div>
  `
  div.querySelector('.btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(content)
    const btn = div.querySelector('.btn-copy')
    btn.textContent = '✓'
    setTimeout(() => { btn.textContent = '📋' }, 1500)
  })
  msgs.appendChild(div)
  scrollChat()
}

function appendTyping(id) {
  const msgs = document.getElementById('chat-messages')
  const div  = document.createElement('div')
  div.className = 'msg'
  div.id = id
  div.innerHTML = `
    <div class="msg-avatar ai">Q</div>
    <div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>
  `
  msgs.appendChild(div)
  scrollChat()
}

function removeTyping(id) {
  const el = document.getElementById(id)
  if (el) el.remove()
}

function appendSystemMsg(text) {
  const msgs = document.getElementById('chat-messages')
  const div  = document.createElement('div')
  div.className = 'hint-box'
  div.style.margin = '4px 0'
  div.textContent = text
  msgs.appendChild(div)
  scrollChat()
}

function scrollChat() {
  const msgs = document.getElementById('chat-messages')
  if (msgs) msgs.scrollTop = msgs.scrollHeight
}

/**
 * Very lightweight markdown-to-HTML for code blocks only.
 * Avoids a full markdown dependency.
 */
function formatCode(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code style="font-family:monospace;font-size:11px;background:rgba(0,0,0,.07);padding:1px 4px;border-radius:3px">$1</code>')
    .replace(/\n/g, '<br>')
}

// ── Settings page ─────────────────────────────────────────────────────────────
function renderSettings() {
  const s    = state.settings
  const page = document.getElementById('page-settings')

  page.innerHTML = `
    <div class="set-sec">Memory</div>
    <div class="set-block">
      <div class="set-row">
        <div><div class="set-lbl">RAM ceiling</div><div class="set-sub">Block models that exceed this limit</div></div>
        <select class="sel" data-key="ramCeilingGb">
          <option value="3.5" ${s.ramCeilingGb===3.5?'selected':''}>3.5 GB</option>
          <option value="4.0" ${s.ramCeilingGb===4.0?'selected':''}>4.0 GB</option>
        </select>
      </div>
      <div class="set-row">
        <div><div class="set-lbl">Swap layers to disk</div><div class="set-sub">Offload to SSD when RAM is tight</div></div>
        <button class="toggle ${s.swapToDisk?'on':''}" data-key="swapToDisk" aria-label="Toggle swap"></button>
      </div>
      <div class="set-row">
        <div><div class="set-lbl">Auto-unload on idle</div><div class="set-sub">Free RAM after 5 min of inactivity</div></div>
        <button class="toggle ${s.autoUnloadIdle?'on':''}" data-key="autoUnloadIdle" aria-label="Toggle idle unload"></button>
      </div>
    </div>

    <div class="set-sec">Inference</div>
    <div class="set-block">
      <div class="set-row">
        <div><div class="set-lbl">CPU threads</div><div class="set-sub">More threads = faster inference and more heat</div></div>
        <select class="sel" data-key="cpuThreads">
          ${[2,4,6,8].map(n => `<option value="${n}" ${s.cpuThreads===n?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="set-row">
        <div><div class="set-lbl">Context window</div><div class="set-sub">Shorter saves RAM; 1024 recommended for 4 GB</div></div>
        <select class="sel" data-key="contextLen">
          ${[512,1024,2048].map(n => `<option value="${n}" ${s.contextLen===n?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="set-row">
        <div><div class="set-lbl">Quantization default</div><div class="set-sub">Q4_K_M balances quality and RAM usage</div></div>
        <select class="sel" data-key="quantDefault">
          ${['Q2_K','Q4_K_M','Q5_K_M','Q8_0'].map(q => `<option value="${q}" ${s.quantDefault===q?'selected':''}>${q}</option>`).join('')}
        </select>
      </div>
      <div class="set-row">
        <div><div class="set-lbl">iGPU offload layers</div><div class="set-sub">Offload layers to integrated GPU if available</div></div>
        <button class="toggle ${s.igpuOffload?'on':''}" data-key="igpuOffload" aria-label="Toggle iGPU"></button>
      </div>
    </div>

    <div class="set-sec">Integrations</div>
    <div class="set-block">
      <div class="set-row">
        <div><div class="set-lbl">Local API server</div><div class="set-sub">OpenAI-compatible at localhost:11434</div></div>
        <button class="toggle ${s.apiServer?'on':''}" data-key="apiServer" aria-label="Toggle API server"></button>
      </div>
      <div class="set-row">
        <div><div class="set-lbl">VS Code autocomplete endpoint</div><div class="set-sub">Expose FIM endpoint for the Continue extension</div></div>
        <button class="toggle ${s.vscodeEndpoint?'on':''}" data-key="vscodeEndpoint" aria-label="Toggle VS Code endpoint"></button>
      </div>
    </div>
  `

  // Bind toggles
  page.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('on')
      const val = btn.classList.contains('on')
      state.settings[btn.dataset.key] = val
      window.api.saveSettings({ [btn.dataset.key]: val })
    })
  })

  // Bind selects
  page.querySelectorAll('select.sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const val = isNaN(sel.value) ? sel.value : parseFloat(sel.value)
      state.settings[sel.dataset.key] = val
      window.api.saveSettings({ [sel.dataset.key]: val })
    })
  })
}
