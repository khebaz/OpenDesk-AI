/**
 * InferenceEngine
 * Spawns llama.cpp's llama-server binary as a child process for each model.
 * Each model gets its own port (11434 + index).
 * Provides a streaming chat() method that calls the OpenAI-compatible endpoint.
 */

const { spawn }  = require('child_process')
const path       = require('path')
const http       = require('http')
const fs         = require('fs')
const { app }    = require('electron')

// Path to the bundled llama-server.exe (placed in resources/bin/ by electron-builder)
function llamaServerBin() {
  const devPath = path.join(__dirname, '../../bin/llama-server.exe')
  if (fs.existsSync(devPath)) return devPath
  return path.join(process.resourcesPath, 'bin', 'llama-server.exe')
}

const BASE_PORT = 11435

class InferenceEngine {
  constructor() {
    this._procs = {}   // modelId → { proc, port, modelMeta }
    this._portIdx = 0
  }

  /**
   * Launch a llama-server process for the given model.
   * Returns { ok, port } or { ok: false, error }.
   */
  async launch(model, settings) {
    if (this._procs[model.id]) {
      return { ok: true, port: this._procs[model.id].port, alreadyRunning: true }
    }

    const port    = BASE_PORT + this._portIdx++
    const threads = (settings && settings.cpuThreads) || 2
    const ctx     = (settings && settings.contextLen)  || 1024
    const batch   = Math.min(ctx, 1024)

    const args = [
      '--model',       model.filePath,
      '--port',        String(port),
      '--host',        '127.0.0.1',
      '--ctx-size',    String(ctx),
      '--threads',     String(threads),
      '--batch-size',  String(batch),
      '--ubatch-size', '256',
      '--n-gpu-layers','0',
      '--parallel',    '1',
    ]

    const bin = llamaServerBin()

    return new Promise((resolve) => {
      let started = false

      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(bin) })

      proc.stdout.on('data', (data) => {
        const out = data.toString()
        // llama-server prints "server is listening" when ready
        if (!started && out.includes('server is listening')) {
          started = true
          this._procs[model.id] = { proc, port, model }
          resolve({ ok: true, port })
        }
      })

      proc.stderr.on('data', (data) => {
        const err = data.toString()
        if (!started && err.includes('server is listening')) {
          started = true
          this._procs[model.id] = { proc, port, model }
          resolve({ ok: true, port })
        }
      })

      proc.on('error', (err) => {
        if (!started) resolve({ ok: false, error: err.message })
      })

      proc.on('exit', (code) => {
        delete this._procs[model.id]
        if (!started) resolve({ ok: false, error: `Process exited with code ${code}` })
      })

      // Timeout after 60 s — model load on slow CPU can take a while
      setTimeout(() => {
        if (!started) {
          proc.kill()
          resolve({ ok: false, error: 'Launch timeout — model may be too large for available RAM' })
        }
      }, 60_000)
    })
  }

  /** Stop a specific model's process. */
  stop(modelId) {
    const entry = this._procs[modelId]
    if (!entry) return { ok: false, error: 'Not running' }
    const proc = entry.proc
    delete this._procs[modelId]
    return new Promise(resolve => {
      let done = false
      const finish = () => { if (!done) { done = true; resolve({ ok: true }) } }
      proc.on('exit', finish)
      proc.on('error', finish)
      proc.kill()
      setTimeout(finish, 3000)
    })
  }

  /** Stop all running models. */
  stopAll() {
    for (const id of Object.keys(this._procs)) {
      this._procs[id].proc.kill()
    }
    this._procs = {}
  }

  /** Return status of all running models. */
  status() {
    return Object.entries(this._procs).map(([id, entry]) => ({
      modelId: id,
      port:    entry.port,
      name:    entry.model.name,
      ramGb:   entry.model.ramGb,
    }))
  }

  /**
   * Send a chat request to a running model's llama-server.
   * Streams tokens back via tokenCb(string).
   * Returns the full assistant message when done.
   */
  chat(modelId, messages, options = {}, tokenCb) {
    const entry = this._procs[modelId]
    if (!entry) return Promise.resolve({ ok: false, error: 'Model not running' })

    const body = JSON.stringify({
      model:       modelId,
      messages,
      stream:      true,
      temperature: options.temperature ?? 0.2,   // low temp = more deterministic code
      top_p:       options.top_p      ?? 0.95,
      max_tokens:  options.maxTokens  ?? 512,
    })

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port:     entry.port,
        path:     '/v1/chat/completions',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let full = ''

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const json = line.slice(6).trim()
            if (json === '[DONE]') continue
            try {
              const parsed = JSON.parse(json)
              const token  = parsed.choices?.[0]?.delta?.content || ''
              if (token) { full += token; tokenCb(token) }
            } catch (_) {}
          }
        })

        res.on('end', () => resolve({ ok: true, content: full }))
        res.on('error', reject)
      })

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }
}

module.exports = InferenceEngine
