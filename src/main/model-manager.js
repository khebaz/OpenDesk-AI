const fs   = require('fs')
const path = require('path')
const https = require('https')
const { app } = require('electron')

const CATALOGUE = [
  {
    id:          'qwen2.5-coder-3b',
    name:        'Qwen2.5-Coder 3B',
    description: 'Best-in-class coding model for 4 GB machines. Code gen, debug, refactor across 40+ languages.',
    role:        'primary',
    ramGb:       1.8,
    paramB:      3,
    quant:       'Q4_K_M',
    hfRepo:      'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF',
    hfFile:      'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    tags:        ['Code gen', 'Debug', 'Refactor', '40+ langs'],
    contextLen:  4096,
    license:     'Apache 2.0',
    category:    'coding',
  },
  {
    id:          'qwen2.5-coder-1.5b',
    name:        'Qwen2.5-Coder 1.5B',
    description: 'Ultralight autocomplete assistant. Always-on fill-in-middle alongside the primary model.',
    role:        'addon',
    ramGb:       1.0,
    paramB:      1.5,
    quant:       'Q4_K_M',
    hfRepo:      'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    hfFile:      'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    tags:        ['Autocomplete', 'FIM'],
    contextLen:  2048,
    license:     'Apache 2.0',
    category:    'coding',
  },
  {
    id:          'qwen2.5-coder-0.5b',
    name:        'Qwen2.5-Coder 0.5B',
    description: 'Tiny 500MB model. Runs as a background linting and quick-complete assistant.',
    role:        'addon',
    ramGb:       0.5,
    paramB:      0.5,
    quant:       'Q4_K_M',
    hfRepo:      'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF',
    hfFile:      'qwen2.5-coder-0.5b-instruct-q4_k_m.gguf',
    tags:        ['Ultra-light', 'Lint'],
    contextLen:  2048,
    license:     'Apache 2.0',
    category:    'coding',
  },
  {
    id:          'deepseek-coder-1.3b',
    name:        'DeepSeek-Coder 1.3B',
    description: 'Fast algorithm and data-structure specialist. Great for competitive programming.',
    role:        'addon',
    ramGb:       0.9,
    paramB:      1.3,
    quant:       'Q4_K_M',
    hfRepo:      'TheBloke/deepseek-coder-1.3b-instruct-GGUF',
    hfFile:      'deepseek-coder-1.3b-instruct.Q4_K_M.gguf',
    tags:        ['Algorithms', 'Fast'],
    contextLen:  4096,
    license:     'DeepSeek License',
    category:    'coding',
  },
  {
    id:          'starcoder2-3b',
    name:        'StarCoder2 3B',
    description: 'Trained purely on source code. Best for less common languages like Rust, Haskell, COBOL.',
    role:        'addon',
    ramGb:       1.8,
    paramB:      3,
    quant:       'Q4_K_M',
    hfRepo:      'bartowski/starcoder2-3b-GGUF',
    hfFile:      'starcoder2-3b-Q4_K_M.gguf',
    tags:        ['Rare langs', 'Completion'],
    contextLen:  4096,
    license:     'BigCode OpenRAIL-M',
    category:    'coding',
  },
  {
    id:          'smollm2-1.7b',
    name:        'SmolLM2 1.7B',
    description: 'Hugging Face\'s efficiency champion. Excellent instruction following and reasoning for its size.',
    role:        'addon',
    ramGb:       1.1,
    paramB:      1.7,
    quant:       'Q4_K_M',
    hfRepo:      'bartowski/SmolLM2-1.7B-Instruct-GGUF',
    hfFile:      'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    tags:        ['Reasoning', 'Fast'],
    contextLen:  2048,
    license:     'Apache 2.0',
    category:    'coding',
  },
]

const DEFAULT_SETTINGS = {
  ramCeilingGb:      4.0,
  swapToDisk:        true,
  autoUnloadIdle:    true,
    cpuThreads:        2,
    contextLen:        2048,
  quantDefault:      'Q4_K_M',
  igpuOffload:       false,
  apiServer:         true,
  apiPort:           11434,
  vscodeEndpoint:    false,
}

class ModelManager {
  constructor() {
    this.dataDir   = path.join(app.getPath('userData'), 'codelight')
    this.modelsDir = path.join(this.dataDir, 'models')
    this.statePath = path.join(this.dataDir, 'state.json')
    this.state     = { installed: {}, settings: { ...DEFAULT_SETTINGS } }
    this._downloads = {}
  }

  async init() {
    fs.mkdirSync(this.modelsDir, { recursive: true })
    if (fs.existsSync(this.statePath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.statePath, 'utf8'))
        this.state = { ...this.state, ...saved }
      } catch (_) {}
    }
    this._pruneOrphans()
  }

  list() {
    return CATALOGUE.map(m => ({
      ...m,
      installed:   this._isInstalled(m.id),
      filePath:    this._modelPath(m.id),
      downloading: !!this._downloads[m.id],
    }))
  }

  get(modelId) {
    const meta = CATALOGUE.find(m => m.id === modelId)
    if (!meta || !this._isInstalled(modelId)) return null
    return { ...meta, filePath: this._modelPath(modelId) }
  }

  getSettings() { return { ...DEFAULT_SETTINGS, ...this.state.settings } }

  saveSettings(updates) {
    this.state.settings = { ...this.state.settings, ...updates }
    this._persist()
    return this.state.settings
  }

  download(modelId, progressCb) {
    return new Promise((resolve, reject) => {
      const meta = CATALOGUE.find(m => m.id === modelId)
      if (!meta) return reject(new Error('Unknown model: ' + modelId))
      if (this._isInstalled(modelId)) return resolve({ ok: true, cached: true })

      const dest    = this._modelPath(modelId)
      const tmpDest = dest + '.part'
      const startUrl = `https://huggingface.co/${meta.hfRepo}/resolve/main/${meta.hfFile}`

      // Follow all redirects (HuggingFace uses multiple hops: HF -> CDN)
      const follow = (url, depth = 0) => {
        if (depth > 10) return reject(new Error('Too many redirects'))
        const lib = url.startsWith('https') ? require('https') : require('http')
        const req = lib.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 OpenDeskAI/0.1',
            'Accept': '*/*',
          }
        }, res => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            res.resume() // drain response
            return follow(res.headers.location, depth + 1)
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} from ${url}`))
          }
          this._streamToFile(res, tmpDest, dest, modelId, progressCb, resolve, reject)
        })
        req.on('error', err => {
          if (fs.existsSync(tmpDest)) try { fs.unlinkSync(tmpDest) } catch(_) {}
          reject(err)
        })
        req.setTimeout(0)
        this._downloads[modelId] = { req }
      }

      follow(startUrl)
    })
  }

  cancelDownload(modelId) {
    const dl = this._downloads[modelId]
    if (dl) { dl.req.destroy(); delete this._downloads[modelId] }
    const tmp = this._modelPath(modelId) + '.part'
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }

  delete(modelId) {
    const p = this._modelPath(modelId)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    if (this.state.installed[modelId]) {
      delete this.state.installed[modelId]
      this._persist()
    }
    return { ok: true }
  }

  _streamToFile(res, tmpDest, dest, modelId, progressCb, resolve, reject) {
    const total  = parseInt(res.headers['content-length'], 10) || 0
    let received = 0
    const file   = fs.createWriteStream(tmpDest)
    res.on('data', chunk => {
      file.write(chunk)
      received += chunk.length
      if (total > 0) progressCb(Math.round((received / total) * 100))
    })
    res.on('end', () => {
      file.end(() => {
        fs.renameSync(tmpDest, dest)
        this.state.installed[modelId] = { ts: Date.now() }
        this._persist()
        delete this._downloads[modelId]
        resolve({ ok: true })
      })
    })
    res.on('error', err => {
      file.close()
      if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest)
      reject(err)
    })
  }

  _modelPath(modelId) {
    const meta = CATALOGUE.find(m => m.id === modelId)
    return path.join(this.modelsDir, meta ? meta.hfFile : modelId + '.gguf')
  }

  _isInstalled(modelId) {
    return !!this.state.installed[modelId] && fs.existsSync(this._modelPath(modelId))
  }

  _pruneOrphans() {
    for (const id of Object.keys(this.state.installed)) {
      if (!fs.existsSync(this._modelPath(id))) delete this.state.installed[id]
    }
    this._persist()
  }

  _persist() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
  }
}

module.exports = ModelManager
