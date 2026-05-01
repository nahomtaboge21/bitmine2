export default function ConfigPanel({ config, onChange, isRunning, connected, onRun, onStop }) {
  const set = (key, val) => onChange(prev => ({ ...prev, [key]: val }))

  return (
    <>
      {/* ── Input ── */}
      <div className="section">
        <div className="section-title">Range</div>

        <div className="field">
          <label>Start (hex)</label>
          <input
            type="text"
            placeholder="10000000000000000000000000000000"
            value={config.startRange}
            onChange={e => set('startRange', e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label>End (hex)</label>
          <input
            type="text"
            placeholder="1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
            value={config.endRange}
            onChange={e => set('endRange', e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label>Public Keys (one per line)</label>
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

        <div className="field">
          <label>CPU Threads</label>
          <input
            type="number"
            min="1"
            value={config.threads}
            onChange={e => set('threads', parseInt(e.target.value) || 1)}
          />
        </div>

        <div className="check-row">
          <input
            type="checkbox"
            id="useGpu"
            checked={config.useGpu}
            onChange={e => set('useGpu', e.target.checked)}
          />
          <label htmlFor="useGpu">Enable GPU</label>
        </div>

        {config.useGpu && (
          <div className="field">
            <label>GPU IDs</label>
            <input
              type="text"
              placeholder="0"
              value={config.gpuIds}
              onChange={e => set('gpuIds', e.target.value)}
            />
          </div>
        )}
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
            title={!connected ? 'Backend not connected' : ''}
          >
            ▶ Run
          </button>
        )}
        {!connected && (
          <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
            Connecting to server...
          </div>
        )}
      </div>
    </>
  )
}
