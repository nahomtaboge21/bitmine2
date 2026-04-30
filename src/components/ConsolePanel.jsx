import { useEffect, useRef } from 'react'

export default function ConsolePanel({ output, isRunning, onClear }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [output])

  function exportLog() {
    const text = output.map(l => l.text).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `kangaroo-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="console-wrap">
      <div className="console-bar">
        <span>
          {isRunning
            ? `● Running — ${output.length} lines`
            : output.length > 0
            ? `${output.length} lines`
            : 'Waiting for output...'}
        </span>
        {output.length > 0 && (
          <>
            <button className="btn-xs" onClick={exportLog}>Export</button>
            <button className="btn-xs" onClick={onClear}>Clear</button>
          </>
        )}
      </div>

      {output.length === 0 ? (
        <div className="console-empty">
          <span className="big">⌨</span>
          <span>Configure options and click Run Kangaroo</span>
        </div>
      ) : (
        <div className="console-lines">
          {output.map(line => (
            <div key={line.id} className={`con-line ${line.cls || ''}`}>
              {line.text}
            </div>
          ))}
          {isRunning && (
            <div className="con-line sys">
              <span className="cursor" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
