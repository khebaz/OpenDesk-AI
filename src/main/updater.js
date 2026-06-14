/**
 * updater.js
 * Checks GitHub releases for a newer version of OpenDesk AI.
 * Notifies the renderer via IPC — never auto-installs without user consent.
 */

const https   = require('https')
const { app } = require('electron')

const RELEASES_API = 'https://api.github.com/repos/yourname/codelight/releases/latest'

function checkForUpdates(mainWindow) {
  const current = app.getVersion()

  https.get(RELEASES_API, { headers: { 'User-Agent': 'OpenDeskAI/' + current } }, (res) => {
    let raw = ''
    res.on('data', d => (raw += d))
    res.on('end', () => {
      try {
        const data    = JSON.parse(raw)
        const latest  = data.tag_name?.replace(/^v/, '')
        if (latest && isNewer(latest, current)) {
          mainWindow.webContents.send('update-available', {
            version:     latest,
            releaseUrl:  data.html_url,
            releaseNotes: data.body || '',
          })
        }
      } catch (_) { /* silently ignore network/parse errors */ }
    })
  }).on('error', () => {})
}

/** Simple semver comparison — returns true if `a` is newer than `b` */
function isNewer(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

module.exports = { checkForUpdates }
