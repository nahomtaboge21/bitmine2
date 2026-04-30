const http       = require('http')
const { WebSocketServer } = require('ws')
const { spawn }  = require('child_process')
const path       = require('path')
const fs         = require('fs')
const os         = require('os')

const PORT = 8080
const WORK_DIR = path.join(__dirname, '..', 'workspace')

if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true })

// ── State ──────────────────────────────────────────────────────────
let currentProcess = null
const clients = new Set()

// ── Helpers ────────────────────────────────────────────────────────
function broadcast(msg) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data)
  }
}

function buildInputFile(cfg) {
  const lines = [
    cfg.startRange.trim(),
    cfg.endRange.trim(),
    ...cfg.publicKeys.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean),
  ]
  return lines.join('\n')
}

function parseArgs(cfg) {
  const args = []
  if (cfg.threads !== undefined && cfg.threads !== '') args.push('-t', String(cfg.threads))
  if (cfg.dpBits) args.push('-d', String(cfg.dpBits))
  if (cfg.useGpu) {
    args.push('-gpu')
    if (cfg.gpuIds) args.push('-gpuId', String(cfg.gpuIds))
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

// ── HTTP server ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

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

      // Write input file
      const inputPath = path.join(WORK_DIR, 'input.txt')
      try {
        fs.writeFileSync(inputPath, buildInputFile(cfg))
      } catch (e) {
        res.writeHead(500)
        return res.end(JSON.stringify({ error: 'Failed to write input file: ' + e.message }))
      }

      const exe  = cfg.kangarooPath || 'Kangaroo'
      const args = parseArgs(cfg)

      broadcast({ type: 'status', data: 'running' })
      broadcast({ type: 'output', data: `[UI] Starting: ${exe} ${args.join(' ')}` })
      broadcast({ type: 'output', data: `[UI] Working directory: ${WORK_DIR}` })

      let proc
      try {
        proc = spawn(exe, args, {
          cwd: WORK_DIR,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        })
      } catch (e) {
        broadcast({ type: 'output', data: `[UI ERROR] Failed to start process: ${e.message}` })
        broadcast({ type: 'status', data: 'idle' })
        res.writeHead(500)
        return res.end(JSON.stringify({ error: e.message }))
      }

      currentProcess = proc

      const onData = data => {
        const lines = data.toString().split(/\r?\n/)
        for (const line of lines) {
          if (line) broadcast({ type: 'output', data: line })
        }
      }

      proc.stdout.on('data', onData)
      proc.stderr.on('data', onData)

      proc.on('close', code => {
        currentProcess = null
        broadcast({ type: 'output', data: `[UI] Process exited (code ${code})` })
        broadcast({ type: 'status', data: code === 0 ? 'done' : 'stopped' })
      })

      proc.on('error', err => {
        currentProcess = null
        broadcast({ type: 'output', data: `[UI ERROR] ${err.message}` })
        broadcast({ type: 'output', data: `[UI] Make sure the Kangaroo binary path is correct` })
        broadcast({ type: 'status', data: 'stopped' })
      })

      res.writeHead(200)
      res.end(JSON.stringify({ ok: true }))
    })
    return
  }

  // POST /api/stop
  if (req.method === 'POST' && req.url === '/api/stop') {
    if (currentProcess) {
      currentProcess.kill()
      currentProcess = null
    }
    broadcast({ type: 'status', data: 'stopped' })
    res.writeHead(200)
    return res.end(JSON.stringify({ ok: true }))
  }

  // GET /api/status
  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200)
    return res.end(JSON.stringify({ running: !!currentProcess }))
  }

  // GET /api/workspace
  if (req.method === 'GET' && req.url === '/api/workspace') {
    let files = []
    try { files = fs.readdirSync(WORK_DIR) } catch {}
    res.writeHead(200)
    return res.end(JSON.stringify({ path: WORK_DIR, files }))
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ── WebSocket server ───────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'status', data: currentProcess ? 'running' : 'idle' }))
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

// ── Start ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Kangaroo backend running on http://localhost:${PORT}`)
  console.log(`Workspace: ${WORK_DIR}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ws`)
})
