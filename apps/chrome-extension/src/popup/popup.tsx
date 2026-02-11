const statusDot = document.getElementById('statusDot') as HTMLElement
const statusText = document.getElementById('statusText') as HTMLElement
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement

function updateStatus(connected: boolean) {
  statusDot.className = `dot ${connected ? 'connected' : 'disconnected'}`
  statusText.textContent = connected ? 'Connected to MCP Server' : 'Disconnected'
  connectBtn.textContent = connected ? 'Reconnect' : 'Connect'
}

// FIX #14: Check chrome.runtime.lastError to prevent unchecked runtime errors
chrome.runtime.sendMessage({ type: 'viyv-get-status' }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn('[viyv-browser:popup] Status check failed:', chrome.runtime.lastError.message)
    updateStatus(false)
    return
  }
  updateStatus(response?.connected ?? false)
})

connectBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'viyv-connect' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[viyv-browser:popup] Connect failed:', chrome.runtime.lastError.message)
      updateStatus(false)
      return
    }
    updateStatus(response?.connected ?? false)
  })
})
