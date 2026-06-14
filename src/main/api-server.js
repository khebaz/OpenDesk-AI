/**
 * ApiServer
 * Exposes an OpenAI-compatible REST API on localhost:11434.
 * This lets VS Code extensions (Continue, CodeGPT, etc.) talk to OpenDesk AI
 * as if it were Ollama or OpenAI.
 */

const http = require('http')

class ApiServer {
  constructor(engine) {
    this._engine = engine
    this._server = null
  }

  start(port = 11434) {
    this._server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin',  '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

      const url = req.url

      // ── GET /api/tags — list installed/running models (Ollama-compatible)
      if (req.method === 'GET' && url === '/api/tags') {
        const running = this._engine.status()
        const models  = running.map(m => ({
          name:        m.name,
          model:       m.modelId,
          modified_at: new Date().toISOString(),
          size:        Math.round(m.ramGb * 1024 * 1024 * 1024),
          details:     { family: 'qwen', parameter_size: 'unknown', quantization_level: 'Q4_K_M' },
        }))
        return this._json(res, { models })
      }

      // ── POST /v1/chat/completions — OpenAI-style chat (used by Continue ext.)
      if (req.method === 'POST' && url === '/v1/chat/completions') {
        return this._readBody(req, async (body) => {
          const { model, messages, stream, max_tokens, temperature } = body
          const running = this._engine.status()
          // Use the requested model, or fall back to the first running one
          const target = running.find(m => m.modelId === model) || running[0]

          if (!target) {
            return this._json(res, { error: 'No model running. Launch a model in OpenDesk AI first.' }, 503)
          }

          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.writeHead(200)

            await this._engine.chat(
              target.modelId,
              messages,
              { maxTokens: max_tokens, temperature },
              (token) => {
                const chunk = {
                  id:      'chatcmpl-stream',
                  object:  'chat.completion.chunk',
                  choices: [{ delta: { content: token }, index: 0, finish_reason: null }],
                }
                res.write(`data: ${JSON.stringify(chunk)}\n\n`)
              }
            )
            res.write('data: [DONE]\n\n')
            return res.end()
          }

          // Non-streaming
          const result = await this._engine.chat(target.modelId, messages, { max_tokens, temperature }, () => {})
          return this._json(res, {
            id:      'chatcmpl-local',
            object:  'chat.completion',
            choices: [{ message: { role: 'assistant', content: result.content }, index: 0, finish_reason: 'stop' }],
            usage:   { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          })
        })
      }

      // ── POST /api/generate — Ollama-style generate
      if (req.method === 'POST' && url === '/api/generate') {
        return this._readBody(req, async (body) => {
          const running = this._engine.status()
          const target  = running[0]
          if (!target) return this._json(res, { error: 'No model running' }, 503)

          const messages = [{ role: 'user', content: body.prompt }]
          res.setHeader('Content-Type', 'application/x-ndjson')
          res.writeHead(200)

          await this._engine.chat(target.modelId, messages, {}, (token) => {
            res.write(JSON.stringify({ response: token, done: false }) + '\n')
          })
          res.write(JSON.stringify({ response: '', done: true }) + '\n')
          res.end()
        })
      }

      // 404 fallback
      this._json(res, { error: 'Not found' }, 404)
    })

    this._server.listen(port, '127.0.0.1', () => {
      console.log(`[ApiServer] listening on http://127.0.0.1:${port}`)
    })
  }

  stop() {
    if (this._server) this._server.close()
  }

  _json(res, obj, status = 200) {
    const body = JSON.stringify(obj)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(body)
  }

  _readBody(req, cb) {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      try { cb(JSON.parse(raw)) } catch (_) { cb({}) }
    })
  }
}

module.exports = ApiServer
