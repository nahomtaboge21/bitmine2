const http = require('http')
const { WebSocketServer } = require('ws')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const PORT = process.env.PORT || 8080
const IS_WIN = process.platform === 'win32'
const KANGAROO_DIR = path.join(__dirname, 'Kangaroo-master')
const DIST_DIR = path.join(__dirname, 'dist')

// ── State ──────────────────────────────────────────────────────────────────
let currentProcess = null
const clients = new Set()

// ── Helpers ────────────────────────────────────────────────────────────────
function broadcast(msg) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data)
  }
}

function buildInputFile(cfg) {
  return [
    cfg.startRange.trim(),
    cfg.endRange.trim(),
    ...cfg.publicKeys.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean),
  ].join('\n')
}

function parseArgs(cfg) {
  const args = []
  if (cfg.threads !== undefined && cfg.threads !== '') args.push('-t', String(cfg.threads))
  if (cfg.dpBits)       args.push('-d', String(cfg.dpBits))
  if (cfg.useGpu) {
    args.push('-gpu')
    if (cfg.gpuIds)   args.push('-gpuId', String(cfg.gpuIds))
    if (cfg.gridSize) args.push('-g', String(cfg.gridSize))
  }
  if (cfg.outputFile)   args.push('-o', cfg.outputFile)
  if (cfg.loadWorkFile) args.push('-i', cfg.loadWorkFile)
  if (cfg.workFile)     args.push('-w', cfg.workFile)
  if (cfg.workFile && cfg.workInterval) args.push('-wi', String(cfg.workInterval))
  if (cfg.saveKangaroos && cfg.workFile) args.push('-ws')
  if (cfg.maxSteps)     args.push('-m', String(cfg.maxSteps))
  if (cfg.mode === 'server') {
    args.push('-s')
    if (cfg.serverPort && cfg.serverPort !== 17403) args.push('-sp', String(cfg.serverPort))
  } else if (cfg.mode === 'client') {
    if (cfg.serverIp) args.push('-c', String(cfg.serverIp))
    if (cfg.serverPort && cfg.serverPort !== 17403) args.push('-sp', String(cfg.serverPort))
  }
  args.push('input.txt')
  return args
}

// Resolve the Kangaroo executable path
function resolveExe(cfgPath) {
  const DEFAULT = IS_WIN ? 'Kangaroo.exe' : 'Kangaroo'
  let name = cfgPath || DEFAULT
  if (path.isAbsolute(name)) return name
  // Check inside Kangaroo-master first
  const inDir = path.join(KANGAROO_DIR, name)
  if (fs.existsSync(inDir)) return inDir
  return name  // fall back to PATH lookup
}

// Serve a static file from dist/
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.woff2':'font/woff2',
}

function serveStatic(req, res) {
  const url = req.url.split('?')[0]
  let filePath = path.join(DIST_DIR, url === '/' ? 'index.html' : url)

  // SPA fallback — unknown paths → index.html
  if (!fs.existsSync(filePath)) filePath = path.join(DIST_DIR, 'index.html')

  const ext  = path.extname(filePath)
  const mime = MIME[ext] || 'application/octet-stream'
  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  // ── API routes ────────────────────────────────────────────────────────
  if (req.url.startsWith('/api/') || req.url === '/ws') {
    res.setHeader('Content-Type', 'application/json')

    // POST /api/run
    if (req.method === 'POST' && req.url === '/api/run') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => {
        let cfg
        try { cfg = JSON.parse(body) }
        catch { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid JSON' })) }

        if (currentProcess) {
          res.writeHead(409)
          return res.end(JSON.stringify({ error: 'A job is already running' }))
        }

        // Write input.txt into Kangaroo-master/
        try {
          fs.writeFileSync(path.join(KANGAROO_DIR, 'input.txt'), buildInputFile(cfg))
        } catch (e) {
          res.writeHead(500)
          return res.end(JSON.stringify({ error: 'Failed to write input.txt: ' + e.message }))
        }

        const exe  = resolveExe(cfg.kangarooPath)
        const args = parseArgs(cfg)

        broadcast({ type: 'status', data: 'running' })
        broadcast({ type: 'output', data: `[UI] ${exe} ${args.join(' ')}` })
        broadcast({ type: 'output', data: `[UI] cwd: ${KANGAROO_DIR}` })

        let proc
        try {
          proc = spawn(exe, args, {
            cwd:   KANGAROO_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: IS_WIN,
          })
        } catch (e) {
          broadcast({ type: 'output', data: `[UI ERROR] ${e.message}` })
          broadcast({ type: 'status', data: 'idle' })
          res.writeHead(500)
          return res.end(JSON.stringify({ error: e.message }))
        }

        currentProcess = proc

        const onData = data => {
          for (const line of data.toString().split(/\r?\n/)) {
            if (line.trim()) broadcast({ type: 'output', data: line })
          }
        }
        proc.stdout.on('data', onData)
        proc.stderr.on('data', onData)

        proc.on('close', code => {
          currentProcess = null
          broadcast({ type: 'output', data: `[UI] Exited (code ${code})` })
          broadcast({ type: 'status', data: code === 0 ? 'done' : 'stopped' })
        })

        proc.on('error', err => {
          currentProcess = null
          broadcast({ type: 'output', data: `[UI ERROR] ${err.message}` })
          broadcast({ type: 'output', data: `[UI] Check the binary path in the config panel` })
          broadcast({ type: 'status', data: 'stopped' })
        })

        res.writeHead(200)
        res.end(JSON.stringify({ ok: true }))
      })
      return
    }

    // POST /api/stop
    if (req.method === 'POST' && req.url === '/api/stop') {
      if (currentProcess) { currentProcess.kill(); currentProcess = null }
      broadcast({ type: 'status', data: 'stopped' })
      res.writeHead(200)
      return res.end(JSON.stringify({ ok: true }))
    }

    // GET /api/status
    if (req.method === 'GET' && req.url === '/api/status') {
      res.writeHead(200)
      return res.end(JSON.stringify({ running: !!currentProcess, platform: process.platform }))
    }

    res.writeHead(404)
    return res.end(JSON.stringify({ error: 'Not found' }))
  }

  // ── Static frontend ────────────────────────────────────────────────────
  if (fs.existsSync(DIST_DIR)) {
    serveStatic(req, res)
  } else {
    res.writeHead(503, { 'Content-Type': 'text/plain' })
    res.end('Frontend not built yet. Run: npm run build')
  }
})

// ── WebSocket ──────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', ws => {
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'status', data: currentProcess ? 'running' : 'idle' }))
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ip = Object.values(require('os').networkInterfaces())
    .flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost'
  console.log(`\n🦘 Kangaroo UI`)
  console.log(`   Local:   http://localhost:${PORT}`)
  console.log(`   Network: http://${ip}:${PORT}`)
  console.log(`   Kangaroo dir: ${KANGAROO_DIR}\n`)
})
