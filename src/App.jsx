import { useState, useEffect, useRef } from 'react'
import ConfigPanel from './components/ConfigPanel'
import ConsolePanel from './components/ConsolePanel'
import ResultsPanel from './components/ResultsPanel'
import './App.css'

const DEFAULT_CONFIG = {
  startRange: '10000000000000000000000000000000',
  endRange:   '1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  publicKeys: '0233709EB11E0D4439A729F21C2C443DEDB727528229713F0065721BA8FA46F00E',
  threads: 4,
  useGpu: false,
  gpuIds: '0',
  gridSize: '',
  dpBits: '',
  maxSteps: '',
  outputFile: 'result.txt',
  workFile: '',
  loadWorkFile: '',
  workInterval: 300,
  saveKangaroos: false,
  mode: 'standalone',
  serverPort: 17403,
  serverIp: '',
  kangarooPath: 'Kangaroo',
}

function buildCommand(cfg) {
  const parts = [cfg.kangarooPath || 'Kangaroo']
  if (cfg.threads !== '' && cfg.threads >= 0) parts.push(`-t ${cfg.threads}`)
  if (cfg.dpBits) parts.push(`-d ${cfg.dpBits}`)
  if (cfg.useGpu) {
    parts.push('-gpu')
    if (cfg.gpuIds) parts.push(`-gpuId ${cfg.gpuIds}`)
    if (cfg.gridSize) parts.push(`-g ${cfg.gridSize}`)
  }
  if (cfg.outputFile) parts.push(`-o ${cfg.outputFile}`)
  if (cfg.loadWorkFile) parts.push(`-i ${cfg.loadWorkFile}`)
  if (cfg.workFile) parts.push(`-w ${cfg.workFile}`)
  if (cfg.workFile && cfg.workInterval) parts.push(`-wi ${cfg.workInterval}`)
  if (cfg.saveKangaroos && cfg.workFile) parts.push('-ws')
  if (cfg.maxSteps) parts.push(`-m ${cfg.maxSteps}`)
  if (cfg.mode === 'server') {
    parts.push('-s')
    if (cfg.serverPort && cfg.serverPort !== 17403) parts.push(`-sp ${cfg.serverPort}`)
  } else if (cfg.mode === 'client') {
    if (cfg.serverIp) parts.push(`-c ${cfg.serverIp}`)
    if (cfg.serverPort && cfg.serverPort !== 17403) parts.push(`-sp ${cfg.serverPort}`)
  }
  parts.push('input.txt')
  return parts
}

function classifyLine(text) {
  const t = text.toLowerCase()
  if (t.includes('priv:') || t.includes('key#') || t.includes('key found')) return 'key'
  if (t.includes('error') || t.includes('failed') || t.includes('cannot')) return 'err'
  if (t.includes('warning') || t.includes('warn')) return 'warn'
  if (t.startsWith('[')) return ''
  return ''
}

function parseResult(line) {
  const privMatch = line.match(/Priv:\s*(0x[0-9a-fA-F]+)/i)
  const pubMatch  = line.match(/Pub:\s*(0x[0-9a-fA-F]+)/i)
  if (privMatch) {
    return { privateKey: privMatch[1], publicKey: pubMatch ? pubMatch[1] : '' }
  }
  return null
}

export default function App() {
  const [config, setConfig]         = useState(DEFAULT_CONFIG)
  const [tab, setTab]               = useState('console')
  const [isRunning, setIsRunning]   = useState(false)
  const [connected, setConnected]   = useState(false)
  const [output, setOutput]         = useState([])
  const [results, setResults]       = useState([])
  const [jobStatus, setJobStatus]   = useState('idle')
  const wsRef = useRef(null)

  useEffect(() => {
    let ws
    let dead = false

    function connect() {
      if (dead) return
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onclose = () => {
        setConnected(false)
        setIsRunning(false)
        if (!dead) setTimeout(connect, 3000)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') {
            const text = msg.data
            const cls  = classifyLine(text)
            setOutput(prev => [...prev, { text, cls, id: Date.now() + Math.random() }])
            const parsed = parseResult(text)
            if (parsed) {
              setResults(prev => [
                ...prev,
                { ...parsed, time: new Date().toLocaleTimeString(), id: Date.now() }
              ])
              setTab('results')
            }
          } else if (msg.type === 'status') {
            setJobStatus(msg.data)
            if (msg.data === 'stopped' || msg.data === 'done') setIsRunning(false)
          }
        } catch {}
      }
    }

    connect()
    return () => { dead = true; ws?.close() }
  }, [])

  async function handleRun() {
    if (!config.startRange.trim() || !config.endRange.trim() || !config.publicKeys.trim()) {
      alert('Please fill in Start Range, End Range, and at least one Public Key.')
      return
    }
    setOutput([])
    setTab('console')
    setJobStatus('running')
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setIsRunning(true)
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to start job')
        setJobStatus('idle')
      }
    } catch {
      alert('Cannot reach the backend server.\nMake sure "npm run server" is running.')
      setJobStatus('idle')
    }
  }

  async function handleStop() {
    try {
      await fetch('/api/stop', { method: 'POST' })
    } catch {}
    setIsRunning(false)
    setJobStatus('idle')
  }

  const cmdParts = buildCommand(config)

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo">🦘</span>
          <h1>Kangaroo ECDLP Solver <span>SECP256K1</span></h1>
        </div>
        <div className="header-right">
          <span className={`badge ${connected ? 'ok' : 'bad'}`}>
            {connected ? '● Server' : '○ No Server'}
          </span>
          <span className="badge info">Keys: {results.length}</span>
          <span className={`badge ${isRunning ? 'run' : jobStatus === 'done' ? 'done' : ''}`}>
            {isRunning ? '⟳ Running' : jobStatus === 'done' ? '✓ Done' : '○ Idle'}
          </span>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <ConfigPanel
            config={config}
            onChange={setConfig}
            cmdParts={cmdParts}
            isRunning={isRunning}
            connected={connected}
            onRun={handleRun}
            onStop={handleStop}
          />
        </aside>

        <main className="main">
          <div className="tab-bar">
            <button
              className={`tab-btn ${tab === 'console' ? 'active' : ''}`}
              onClick={() => setTab('console')}
            >
              Console {output.length > 0 ? `(${output.length})` : ''}
            </button>
            <button
              className={`tab-btn ${tab === 'results' ? 'active' : ''}`}
              onClick={() => setTab('results')}
            >
              Results {results.length > 0 ? `(${results.length})` : ''}
            </button>
          </div>
          <div className="tab-content">
            {tab === 'console' && (
              <ConsolePanel
                output={output}
                isRunning={isRunning}
                onClear={() => setOutput([])}
              />
            )}
            {tab === 'results' && (
              <ResultsPanel results={results} onClear={() => setResults([])} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
