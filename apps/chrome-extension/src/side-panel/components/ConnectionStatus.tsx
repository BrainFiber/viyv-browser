import React, { useEffect, useState } from 'react'

export function ConnectionStatus() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const check = () => {
      chrome.runtime.sendMessage({ type: 'viyv-get-status' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[viyv-browser:side-panel]', chrome.runtime.lastError.message)
          setConnected(false)
          return
        }
        setConnected(response?.connected ?? false)
      })
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: connected ? '#4CAF50' : '#f44336',
        }}
      />
      <span style={{ fontSize: 13 }}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  )
}
