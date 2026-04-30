export default function ConfigPanel({ config, onChange, cmdParts, isRunning, connected, onRun, onStop }) {
  const set = (key, val) => onChange(prev => ({ ...prev, [key]: val }))

  const renderCmd = () => {
    if (!cmdParts || cmdParts.length === 0) return null
    const [name, ...rest] = cmdParts
    const tokens = []
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i]
      if (t.startsWith('-')) {
        tokens.push(<span key={i} className="c-flag">{t} </span>)
      } else {
        tokens.push(<span key={i} className="c-val">{t} </span>)
      }
    }
    return (
      <>
        <span className="c-name">{name} </span>
        {tokens}
      </>
    )
  }

  return (
    <>
      {/* ── Input ── */}
      <div className="section">
        <div className="section-title">Input Configuration</div>

        <div className="field">
          <label>Start Range (hex)</label>
          <input
            type="text"
            placeholder="49dccfd96dc5df5648..."
            value={config.startRange}
            onChange={e => set('startRange', e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label>End Range (hex)</label>
          <input
            type="text"
            placeholder="49dccfd96dc5df5648...ffffffffffffffff"
            value={config.endRange}
            onChange={e => set('endRange', e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label>Public Keys (one per line, compressed or uncompressed)</label>
          <textarea
            placeholder="0459A3BFDAD718C9D3FA..."
            value={config.publicKeys}
            onChange={e => set('publicKeys', e.target.value)}
            spellCheck={false}
            rows={4}
          />
        </div>
      </div>

      {/* ── Computation ── */}
      <div className="section">
        <div className="section-title">Computation</div>

        <div className="field-row">
          <div className="field">
            <label>CPU Threads</label>
            <input
              type="number"
              min="0"
              value={config.threads}
              onChange={e => set('threads', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>DP Bits</label>
            <input
              type="number"
              min="1"
              max="30"
              placeholder="auto"
              value={config.dpBits}
              onChange={e => set('dpBits', e.target.value)}
            />
          </div>
        </div>

        <div className="check-row">
          <input
            type="checkbox"
            id="useGpu"
            checked={config.useGpu}
            onChange={e => set('useGpu', e.target.checked)}
          />
          <label htmlFor="useGpu">Enable GPU acceleration</label>
        </div>

        {config.useGpu && (
          <div className="field-row">
            <div className="field">
              <label>GPU IDs</label>
              <input
                type="text"
                placeholder="0,1"
                value={config.gpuIds}
                onChange={e => set('gpuIds', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Grid Size</label>
              <input
                type="text"
                placeholder="e.g. 64,128"
                value={config.gridSize}
                onChange={e => set('gridSize', e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label>Max Steps</label>
          <input
            type="number"
            min="0"
            placeholder="unlimited"
            value={config.maxSteps}
            onChange={e => set('maxSteps', e.target.value)}
          />
          <div className="hint">Stop after N million operations (0 = run until found)</div>
        </div>
      </div>

      {/* ── Work File ── */}
      <div className="section">
        <div className="section-title">Work File</div>

        <div className="field">
          <label>Save Work File</label>
          <input
            type="text"
            placeholder="save.work"
            value={config.workFile}
            onChange={e => set('workFile', e.target.value)}
          />
        </div>

        <div className="field">
          <label>Load Work File (resume)</label>
          <input
            type="text"
            placeholder="save.work"
            value={config.loadWorkFile}
            onChange={e => set('loadWorkFile', e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Save Interval (s)</label>
            <input
              type="number"
              min="10"
              value={config.workInterval}
              onChange={e => set('workInterval', parseInt(e.target.value) || 300)}
            />
          </div>
          <div className="field">
            <label>Output File</label>
            <input
              type="text"
              placeholder="result.txt"
              value={config.outputFile}
              onChange={e => set('outputFile', e.target.value)}
            />
          </div>
        </div>

        <div className="check-row">
          <input
            type="checkbox"
            id="saveKang"
            checked={config.saveKangaroos}
            onChange={e => set('saveKangaroos', e.target.checked)}
            disabled={!config.workFile}
          />
          <label htmlFor="saveKang">Save kangaroos in work file (-ws)</label>
        </div>
      </div>

      {/* ── Network Mode ── */}
      <div className="section">
        <div className="section-title">Network Mode</div>

        <div className="mode-row" style={{ marginBottom: 10 }}>
          {['standalone', 'server', 'client'].map(m => (
            <button
              key={m}
              className={`mode-btn ${config.mode === m ? 'active' : ''}`}
              onClick={() => set('mode', m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {config.mode !== 'standalone' && (
          <div className="field-row">
            {config.mode === 'client' && (
              <div className="field">
                <label>Server IP / Hostname</label>
                <input
                  type="text"
                  placeholder="192.168.1.100"
                  value={config.serverIp}
                  onChange={e => set('serverIp', e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label>Port</label>
              <input
                type="number"
                value={config.serverPort}
                onChange={e => set('serverPort', parseInt(e.target.value) || 17403)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Kangaroo Binary ── */}
      <div className="section">
        <div className="section-title">Binary Path</div>
        <div className="field">
          <label>Kangaroo executable</label>
          <input
            type="text"
            placeholder="Kangaroo.exe"
            value={config.kangarooPath}
            onChange={e => set('kangarooPath', e.target.value)}
          />
          <div className="hint">Relative names are resolved inside <code>Kangaroo-master/</code></div>
        </div>
      </div>

      {/* ── Command Preview ── */}
      <div className="section">
        <div className="section-title">Command Preview</div>
        <div className="cmd-box">{renderCmd()}</div>
      </div>

      {/* ── Run / Stop ── */}
      <div className="section">
        {isRunning ? (
          <button className="run-btn stop" onClick={onStop}>
            ⬛ Stop
          </button>
        ) : (
          <button
            className="run-btn start"
            onClick={onRun}
            disabled={!connected}
            title={!connected ? 'Backend server not connected' : ''}
          >
            ▶ Run Kangaroo
          </button>
        )}
        {!connected && (
          <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
            Start the backend: <code style={{ color: 'var(--yellow)' }}>npm run server</code>
          </div>
        )}
      </div>
    </>
  )
}
