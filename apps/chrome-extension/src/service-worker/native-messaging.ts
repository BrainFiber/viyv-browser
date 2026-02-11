const NATIVE_HOST_NAME = 'com.viyv.browser'
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

type MessageHandler = (message: Record<string, unknown>) => void
type StatusHandler = (connected: boolean) => void

let port: chrome.runtime.Port | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let messageHandler: MessageHandler | null = null
let statusHandler: StatusHandler | null = null

export function setMessageHandler(handler: MessageHandler) {
  messageHandler = handler
}

export function setStatusHandler(handler: StatusHandler) {
  statusHandler = handler
}

export function connect() {
  if (port) return

  try {
    port = chrome.runtime.connectNative(NATIVE_HOST_NAME)
    // M3 FIX: Don't reset reconnectAttempt here — connection may disconnect immediately.
    // Reset only after receiving the first message, proving the connection is stable.
    console.log('[viyv-browser:SW] Native messaging connected')
    statusHandler?.(true)

    port.onMessage.addListener((message: Record<string, unknown>) => {
      // M3 FIX: First message confirms a working connection — reset backoff
      if (reconnectAttempt > 0) {
        reconnectAttempt = 0
      }
      messageHandler?.(message)
    })

    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError
      console.warn('[viyv-browser:SW] Native messaging disconnected:', error?.message)
      port = null
      statusHandler?.(false)
      scheduleReconnect()
    })
  } catch (error) {
    console.error('[viyv-browser:SW] Failed to connect native messaging:', error)
    port = null
    statusHandler?.(false)
    scheduleReconnect()
  }
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (port) {
    port.disconnect()
    port = null
  }
  // Reset backoff on explicit disconnect (user-initiated reconnect should start fresh)
  reconnectAttempt = 0
  statusHandler?.(false)
}

export function sendMessage(message: unknown): boolean {
  if (!port) {
    console.warn('[viyv-browser:SW] Cannot send message: port not connected')
    return false
  }
  try {
    port.postMessage(message)
    return true
  } catch (error) {
    console.warn('[viyv-browser:SW] sendMessage failed:', error)
    return false
  }
}

export function isConnected(): boolean {
  return port !== null
}

function scheduleReconnect() {
  if (reconnectTimer) return

  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
  reconnectAttempt++

  console.log(`[viyv-browser:SW] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}
