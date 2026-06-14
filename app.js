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

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadData()
  bindNav()
  renderHome()
  renderLibrary()
  renderSettings()
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
  const titles = { home: 'Models', chat: 'Code chat', library: 'Add models', settings: 'Settings' }
  document.getElementById('page-title').textContent = titles[page] || ''
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
  const isRunning = state.runningIds.has(primary?.id)
  const page    = document.getElementById('page-home')

  page.innerHTML = `
    ${heroCardHtml(primary, isRunning)}

    <div class="sec-lbl">Active add-ons <span style="font-size:10px;background:var(--bg2);border:0.5px solid var(--border);border-radius:10px;padding:1px 6px;text-transform:none;letter-spacing:0;color:var(--text2);font-weight:400;margin-left:4px">${addons.length} loaded</span></div>
    <div id="addon-list">${addons.map(m => addonRowHtml(m)).join('')}</div>
    <button class="add-btn" id="add-model-btn">＋ Add a lightweight model</button>

    <div class="sec-lbl" style="margin-top:4px">Status</div>
    <div class="hint-box" id="status-hint">ℹ Launch a model above to start coding.</div>
  `

  // Events
  if (!primary.installed) {
    page.querySelector('#btn-install-primary')?.addEventListener('click', () => {
      downloadModel(primary.id)
    })
  } else if (!isRunning) {
    page.querySelector('#btn-launch-primary')?.addEventListener('click', () => launchModel(primary.id))
  } else {
    page.querySelector('#btn-stop-primary')?.addEventListener('click', () => stopModel(primary.id))
  }

  page.querySelector('#add-model-btn')?.addEventListener('click', () => navigateTo('library'))

  addons.forEach(m => {
    page.querySelector(`#remove-${m.id}`)?.addEventListener('click', () => removeAddon(m.id))
  })

  updateStatusBar()
}

function heroCardHtml(m, isRunning) {
  if (!m) return '<p>No primary model found.</p>'

  let actionHtml
  if (!m.installed) {
    actionHtml = `<button class="btn-primary" id="btn-install-primary">⬇ Download model</button>
                  <span style="font-size:11px;color:var(--text2);margin-left:6px">${m.ramGb} GB · ${m.quant}</span>`
  } else if (!isRunning) {
    actionHtml = `<button class="btn-primary" id="btn-launch-primary">▶ Launch model</button>`
  } else {
    actionHtml = `<button class="btn-stop" id="btn-stop-primary">■ Stop</button>
                  <button class="btn-primary" disabled style="opacity:.4;cursor:default;margin-left:6px">▶ Running</button>`
  }

  return `
    <div class="hero-card">
      <div class="hero-l">
        <div class="hero-badge">★ Primary model</div>
        <div class="hero-name">${m.name}</div>
        <div class="hero-desc">${m.description}</div>
        <div class="stats">
          <div class="stat"><div class="stat-n">${m.ramGb} GB</div><div class="stat-l">RAM usage</div></div>
          <div class="stat"><div class="stat-n">~14 t/s</div><div class="stat-l">CPU speed</div></div>
          <div class="stat"><div class="stat-n">${m.tags.length > 2 ? '40+' : m.paramB + 'B'}</div><div class="stat-l">Languages</div></div>
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

function addonRowHtml(m) {
  return `
    <div class="mc loaded">
      <div class="mc-ico" style="background:${m._bg||'#e6f4ed'};color:${m._tc||'#1a6b3c'}">${m._icon||'📦'}</div>
      <div style="flex:1;min-width:0">
        <div class="mc-name">${m.name}</div>
        <div class="mc-sub">${m.ramGb} GB · Loaded</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${m.tags.slice(0,1).map(t => `<span class="tag tag-g">${t}</span>`).join('')}
        <button class="btn-sm" id="remove-${m.id}" style="color:#b91c1c;border-color:#f09595">✕</button>
      </div>
    </div>
  `
}

// ── Launch / Stop ─────────────────────────────────────────────────────────────
async function launchModel(modelId) {
  setHint(`Loading ${modelId}…`)
  const result = await window.api.launchModel(modelId)
  if (result.ok) {
    state.runningIds.add(modelId)
    state.activeChatId = modelId
    setEngineStatus(true)
    updateStatusBar()
    setHint(`✓ Model running — <a href="#" id="go-chat" style="color:var(--acc)">open code chat →</a>`)
    document.getElementById('go-chat')?.addEventListener('click', e => {
      e.preventDefault(); navigateTo('chat')
    })
  } else {
    setHint(`⚠ Launch failed: ${result.error}`)
  }
  renderHome()
}

async function stopModel(modelId) {
  await window.api.stopModel(modelId)
  state.runningIds.delete(modelId)
  if (state.activeChatId === modelId) state.activeChatId = null
  setEngineStatus(state.runningIds.size > 0)
  updateStatusBar()
  renderHome()
}

async function removeAddon(modelId) {
  await window.api.stopModel(modelId)
  state.runningIds.delete(modelId)
  // Update local state
  const m = state.models.find(x => x.id === modelId)
  if (m) m.installed = false
  renderHome()
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
    <div class="notice-box">
      ⚠ <div><strong>About video generation:</strong> Video AI models need 8–10 GB RAM minimum and cannot run on 4 GB machines. Below are the best lightweight <strong>coding</strong> add-ons that genuinely fit your RAM.</div>
    </div>
    <div class="cat-label">⌨ Coding add-ons — all fit in 4 GB alongside primary</div>
    <div class="lib-grid">
      ${addons.map(libCardHtml).join('')}
    </div>
  `

  addons.forEach(m => {
    if (!m.installed) {
      page.querySelector(`#btn-lib-${m.id}`)?.addEventListener('click', () => {
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
          : `<button class="btn-add" id="btn-lib-${m.id}">Add</button>`}
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
  overlay.id = `dl-overlay-${modelId}`
  overlay.innerHTML = `
    <div class="modal">
      <h3>Downloading ${m.name}</h3>
      <p>${m.name} ${m.quant} GGUF · ${m.ramGb} GB · from Hugging Face</p>
      <div class="prog-bg"><div class="prog-fill" id="prog-fill-${modelId}"></div></div>
      <div class="prog-lbl" id="prog-lbl-${modelId}">0%</div>
      <div class="modal-btns">
        <button class="btn-sm" id="cancel-dl-${modelId}">Cancel</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById(`cancel-dl-${modelId}`)?.addEventListener('click', () => {
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
    }
  })
}

function updateDownloadModal(modelId, progress) {
  const fill = document.getElementById(`prog-fill-${modelId}`)
  const lbl  = document.getElementById(`prog-lbl-${modelId}`)
  if (fill) fill.style.width = progress + '%'
  if (lbl)  lbl.textContent  = progress + '%'
}

// ── Chat page ─────────────────────────────────────────────────────────────────
function renderChat() {
  const page = document.getElementById('page-chat')
  page.innerHTML = `
    <div id="chat-messages">
      <div class="msg">
        <div class="msg-avatar ai">Q</div>
        <div class="msg-bubble">Hi! I'm <strong>Qwen2.5-Coder 3B</strong> running locally on your machine.
Ask me to write, debug, refactor, or explain code — what are you working on?</div>
      </div>
    </div>
    <div id="chat-input-bar">
      <input type="text" id="chat-input" placeholder="Write me a function that…" />
      <button id="btn-send">↑</button>
    </div>
  `

  const input = document.getElementById('chat-input')
  const btn   = document.getElementById('btn-send')

  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage() })
  btn.addEventListener('click', sendMessage)
}

let _streamTarget = null

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

  state.chatHistory.push({ role: 'user', content: text })
  appendMessage('user', text)

  // Typing indicator
  const typingId = 'typing-' + Date.now()
  appendTyping(typingId)

  _streamTarget = { id: typingId, content: '' }

  await window.api.chat(modelId, state.chatHistory, { maxTokens: 512, temperature: 0.2 })

  // After stream ends
  const full = _streamTarget.content
  _streamTarget = null
  state.chatHistory.push({ role: 'assistant', content: full })

  const typingEl = document.getElementById(typingId)
  if (typingEl) {
    typingEl.querySelector('.msg-bubble').innerHTML = formatCode(full)
  }

  scrollChat()
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
    <div class="msg-bubble">${formatCode(content)}</div>
  `
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
