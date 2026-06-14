/**
 * IdleManager
 * Watches for inactivity and unloads models to free RAM.
 * Respects the user's autoUnloadIdle setting.
 */

const IDLE_TIMEOUT_MS = 5 * 60 * 1000  // 5 minutes

class IdleManager {
  constructor(engine, getSettings) {
    this._engine      = engine
    this._getSettings = getSettings
    this._timers      = {}  // modelId → timeout handle
  }

  /** Call this every time a model is used (chat message sent, etc.) */
  activity(modelId) {
    this._clear(modelId)
    const settings = this._getSettings()
    if (!settings.autoUnloadIdle) return

    this._timers[modelId] = setTimeout(() => {
      console.log(`[IdleManager] Unloading idle model: ${modelId}`)
      this._engine.stop(modelId)
      delete this._timers[modelId]
    }, IDLE_TIMEOUT_MS)
  }

  /** Cancel the idle timer for a model (e.g. when it's manually stopped) */
  cancel(modelId) {
    this._clear(modelId)
  }

  cancelAll() {
    for (const id of Object.keys(this._timers)) this._clear(id)
  }

  _clear(modelId) {
    if (this._timers[modelId]) {
      clearTimeout(this._timers[modelId])
      delete this._timers[modelId]
    }
  }
}

module.exports = IdleManager
