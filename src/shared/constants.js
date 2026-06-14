/**
 * Shared constants — imported by both main and renderer (via preload).
 * Keep this file free of Node.js built-ins so it's safe in the renderer.
 */

/** Default port for the local OpenAI-compatible API server */
const API_PORT = 11434

/** How often (ms) to send RAM stats to the renderer */
const RAM_POLL_INTERVAL = 2000

/** Minimum free RAM (GB) before showing a warning */
const RAM_WARNING_THRESHOLD_GB = 0.6

/** Maximum model load timeout in milliseconds */
const MODEL_LOAD_TIMEOUT_MS = 60_000

/** IPC channel names — centralised to avoid typos */
const IPC = {
  MODELS_LIST:              'models:list',
  MODELS_DOWNLOAD:          'models:download',
  MODELS_DOWNLOAD_PROGRESS: 'models:download-progress',
  MODELS_CANCEL:            'models:cancel-download',
  MODELS_DELETE:            'models:delete',
  ENGINE_LAUNCH:            'engine:launch',
  ENGINE_STOP:              'engine:stop',
  ENGINE_STATUS:            'engine:status',
  ENGINE_CHAT:              'engine:chat',
  ENGINE_TOKEN:             'engine:token',
  SETTINGS_GET:             'settings:get',
  SETTINGS_SAVE:            'settings:save',
  RAM_UPDATE:               'ram-update',
  WINDOW_MINIMIZE:          'window:minimize',
  WINDOW_MAXIMIZE:          'window:maximize',
  WINDOW_CLOSE:             'window:close',
  OPEN_URL:                 'open-url',
}

module.exports = { API_PORT, RAM_POLL_INTERVAL, RAM_WARNING_THRESHOLD_GB, MODEL_LOAD_TIMEOUT_MS, IPC }
