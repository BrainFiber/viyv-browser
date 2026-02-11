/**
 * Visual indicator showing when an AI agent is controlling this page.
 * Shows a pulsing border and agent name + stop button.
 */

let indicator: HTMLDivElement | null = null
let pulseStyle: HTMLStyleElement | null = null
let badge: HTMLDivElement | null = null

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'viyv-show-indicator') {
    showIndicator(message.agentName, message.color)
  } else if (message.type === 'viyv-hide-indicator') {
    hideIndicator()
  }
})

function showIndicator(agentName: string, color: string) {
  if (indicator) hideIndicator()

  pulseStyle = document.createElement('style')
  pulseStyle.textContent = `
    @keyframes viyv-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
  `
  document.head.appendChild(pulseStyle)

  indicator = document.createElement('div')
  indicator.id = 'viyv-agent-indicator'
  Object.assign(indicator.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: '3px',
    background: color || '#4A90D9',
    zIndex: '2147483647',
    animation: 'viyv-pulse 2s ease-in-out infinite',
    pointerEvents: 'none',
  })

  badge = document.createElement('div')
  Object.assign(badge.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    background: color || '#4A90D9',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    pointerEvents: 'auto',
    cursor: 'default',
  })
  badge.textContent = `Agent: ${agentName}`

  const stopBtn = document.createElement('button')
  Object.assign(stopBtn.style, {
    background: 'rgba(255,255,255,0.3)',
    border: 'none',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '11px',
  })
  stopBtn.textContent = 'Stop'
  stopBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'viyv-agent-stop' })
    hideIndicator()
  }
  badge.appendChild(stopBtn)

  document.body.appendChild(indicator)
  document.body.appendChild(badge)
}

function hideIndicator() {
  indicator?.remove()
  indicator = null
  pulseStyle?.remove()
  pulseStyle = null
  badge?.remove()
  badge = null
  document.getElementById('viyv-agent-indicator')?.remove()
}
