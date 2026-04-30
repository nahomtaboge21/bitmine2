import { useState } from 'react'

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button className="copy-btn" onClick={copy}>
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

export default function ResultsPanel({ results, onClear }) {
  function exportJson() {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `kangaroo-results-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    const rows = ['Private Key,Public Key,Time', ...results.map(r =>
      `${r.privateKey},${r.publicKey || ''},${r.time}`
    )]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `kangaroo-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="results-wrap">
      <div className="results-bar">
        <span>{results.length === 0 ? 'No keys found yet' : `${results.length} key${results.length > 1 ? 's' : ''} found`}</span>
        {results.length > 0 && (
          <>
            <button className="btn-xs" onClick={exportJson}>JSON</button>
            <button className="btn-xs" onClick={exportCsv}>CSV</button>
            <button className="btn-xs" onClick={onClear}>Clear</button>
          </>
        )}
      </div>

      {results.length === 0 ? (
        <div className="results-empty">
          <span className="big">🔑</span>
          <p>Keys will appear here when found</p>
        </div>
      ) : (
        <div className="results-scroll">
          {results.map((r, i) => (
            <div key={r.id} className="result-card">
              <div className="result-card-header">
                <span className="label">Key #{i + 1} Found</span>
                <span className="time">{r.time}</span>
              </div>

              <div className="result-field">
                <div className="rf-label">Private Key</div>
                <div className="rf-val">
                  <span style={{ flex: 1 }}>{r.privateKey}</span>
                  <CopyBtn text={r.privateKey} />
                </div>
              </div>

              {r.publicKey && (
                <div className="result-field">
                  <div className="rf-label">Public Key</div>
                  <div className="rf-val" style={{ color: 'var(--text-2)' }}>
                    <span style={{ flex: 1 }}>{r.publicKey}</span>
                    <CopyBtn text={r.publicKey} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
