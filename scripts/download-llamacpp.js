/**
 * scripts/download-llamacpp.js
 * Auto-fetches the LATEST llama.cpp Windows release from GitHub — never goes stale.
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')
const { execSync } = require('child_process')

const BIN_DIR  = path.join(__dirname, '../bin')
const EXE_PATH = path.join(BIN_DIR, 'llama-server.exe')

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'OpenDeskAI/0.1', 'Accept': 'application/json' }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(get(res.headers.location))
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'OpenDeskAI/0.1' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) return follow(res.headers.location)
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
        const total = parseInt(res.headers['content-length'], 10) || 0
        let received = 0
        const file = fs.createWriteStream(dest)
        res.on('data', chunk => {
          file.write(chunk)
          received += chunk.length
          if (total > 0) process.stdout.write(`\r  ${Math.round((received / total) * 100)}%   `)
        })
        res.on('end', () => file.end(() => { console.log(''); resolve() }))
        res.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { const sub = findFile(full, name); if (sub) return sub }
    else if (entry.name === name) return full
  }
  return null
}

async function main() {
  if (fs.existsSync(EXE_PATH)) {
    console.log('✓ llama-server.exe already present at', EXE_PATH)
    return
  }

  fs.mkdirSync(BIN_DIR, { recursive: true })

  // Step 1: get latest release info (with fallback)
  console.log('Fetching latest llama.cpp release info...')
  const LLAMA_TAG = 'b9592'
  let zipName = `llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`
  let downloadUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${zipName}`
  try {
    const releaseJson = await get('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest')
    const release = JSON.parse(releaseJson)
    const tag = release.tag_name
    console.log('Latest release:', tag)
    const asset = release.assets.find(a =>
      a.name.includes('win') && a.name.includes('x64') && a.name.endsWith('.zip') && !a.name.includes('cuda') && !a.name.includes('vulkan') && !a.name.includes('hip')
    )
    if (asset) {
      zipName = asset.name
      downloadUrl = asset.browser_download_url
      console.log('Using:', zipName)
    } else {
      console.log('API did not return expected asset, using fallback URL')
    }
  } catch (e) {
    console.log('API error, using fallback URL:', e.message)
  }

  console.log('Downloading:', zipName)
  const zipPath = path.join(BIN_DIR, zipName)
  await downloadFile(downloadUrl, zipPath)

  // Step 3: extract using PowerShell
  console.log('Extracting...')
  const extractDir = path.join(BIN_DIR, 'extracted')
  fs.mkdirSync(extractDir, { recursive: true })
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
    { stdio: 'inherit' }
  )

  // Step 4: copy all files (exe + required DLLs) to bin
  fs.rmSync(BIN_DIR, { recursive: true, force: true })
  fs.renameSync(extractDir, BIN_DIR)

  // Cleanup
  fs.unlinkSync(zipPath)

  console.log('✓ llama-server.exe ready at', EXE_PATH)
}

main().catch(err => { console.error('Error:', err.message); process.exit(1) })
