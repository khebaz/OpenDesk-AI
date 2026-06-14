/**
 * RamMonitor
 * Reads system RAM usage.
 * Uses os.freemem() / os.totalmem() (cross-platform, no extra deps).
 */

const os = require('os')

class RamMonitor {
  read() {
    const totalBytes = os.totalmem()
    const freeBytes  = os.freemem()
    const usedBytes  = totalBytes - freeBytes

    const totalGb = totalBytes / 1024 ** 3
    const usedGb  = usedBytes  / 1024 ** 3
    const freeGb  = freeBytes  / 1024 ** 3
    const pct     = Math.round((usedGb / totalGb) * 100)

    return {
      totalGb: parseFloat(totalGb.toFixed(1)),
      usedGb:  parseFloat(usedGb.toFixed(1)),
      freeGb:  parseFloat(freeGb.toFixed(1)),
      pct,
      // Warn if free RAM drops below 600 MB
      warning: freeGb < 0.6,
    }
  }
}

module.exports = RamMonitor
