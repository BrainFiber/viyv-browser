import { PROTOCOL_VERSION } from '@viyv-browser/shared'
import { setupDialogHandler } from './dialog-handler'
import { startKeepAlive } from './keep-alive'
import {
  connect as connectNative,
  disconnect as disconnectNative,
  isConnected,
  sendMessage,
  setMessageHandler,
  setStatusHandler,
} from './native-messaging'
import { getAgentGroup, initTabManager, removeAgentGroup } from './tab-manager'
import {
  addConsoleMessage,
  addNetworkRequest,
  cleanupAgentState,
  cleanupTabBuffers,
  handleToolCall,
} from './tool-handlers'

console.log('[viyv-browser:SW] Service Worker starting')

// ── Initialize ──

startKeepAlive()
setupDialogHandler()
initTabManager().catch((err) => {
  console.warn('[viyv-browser:SW] Failed to restore tab manager state:', err)
})

// Connect native messaging at startup (auto-reconnect handles retries if host is not ready)
connectNative()

// ── Native Messaging ──

// FIX #13: Wrap async handler to ensure SW stays alive during tool execution
setMessageHandler((message) => {
  const msg = message as {
    id: string
    type: string
    agentId: string
    tool?: string
    input?: Record<string, unknown>
  }

  if (msg.type === 'tool_call' && msg.tool && msg.input) {
    console.log(`[viyv-browser:SW] Tool call: ${msg.tool}`, msg.id)
    // Use chrome.storage.session write to keep SW alive during async execution
    const keepAlive = setInterval(() => {
      chrome.storage.session.set({ _keepAlive: Date.now() }).catch(() => {})
    }, 25_000)

    handleToolCall(msg.agentId, msg.tool, msg.input)
      .then((result) => {
        try {
          sendMessage({
            id: msg.id,
            type: 'tool_result',
            agentId: msg.agentId,
            ...result,
            timestamp: Date.now(),
          })
        } catch (sendErr) {
          console.warn('[viyv-browser:SW] Failed to send tool result:', sendErr)
        }
      })
      .catch((error) => {
        try {
          sendMessage({
            id: msg.id,
            type: 'tool_result',
            agentId: msg.agentId,
            success: false,
            error: { code: 'INTERNAL_ERROR', message: String(error) },
            timestamp: Date.now(),
          })
        } catch (sendErr) {
          console.warn('[viyv-browser:SW] Failed to send error result:', sendErr)
        }
      })
      .finally(() => {
        clearInterval(keepAlive)
      })
  } else if (msg.type === 'session_init') {
    // NM3: Check protocol version compatibility
    const remoteVersion = (msg as Record<string, unknown>).protocolVersion as string | undefined
    if (remoteVersion && remoteVersion !== PROTOCOL_VERSION) {
      console.warn(
        `[viyv-browser:SW] Protocol version mismatch: local=${PROTOCOL_VERSION}, remote=${remoteVersion}`,
      )
    }
    console.log(`[viyv-browser:SW] Session init: ${msg.agentId}`)
    sendMessage({
      id: msg.id,
      type: 'session_init',
      agentId: msg.agentId,
      protocolVersion: PROTOCOL_VERSION,
      timestamp: Date.now(),
    })
  } else if (msg.type === 'session_close') {
    // NH2: Clean up agent resources on session close
    // L5 FIX: Await cleanup before sending response to prevent race conditions
    console.log(`[viyv-browser:SW] Session close: ${msg.agentId}`)
    // M2 FIX: Clean up agent-scoped state (GIF recordings, etc.)
    cleanupAgentState(msg.agentId)
    // L2 FIX: Keep SW alive during async cleanup (same pattern as tool_call)
    const keepAlive = setInterval(() => {
      chrome.storage.session.set({ _keepAlive: Date.now() }).catch(() => {})
    }, 25_000)
    removeAgentGroup(msg.agentId)
      .catch((err) => {
        console.warn('[viyv-browser:SW] Failed to remove agent group:', err)
      })
      .finally(() => {
        clearInterval(keepAlive)
        sendMessage({
          id: msg.id,
          type: 'session_close',
          agentId: msg.agentId,
          timestamp: Date.now(),
        })
      })
  } else if (msg.type === 'session_recovery') {
    // NH2: Re-establish session from persisted state
    console.log(`[viyv-browser:SW] Session recovery: ${msg.agentId}`)
    const group = getAgentGroup(msg.agentId)
    sendMessage({
      id: msg.id,
      type: 'session_recovery',
      agentId: msg.agentId,
      recovered: !!group,
      group: group ? { groupId: group.groupId, tabs: Array.from(group.tabs) } : null,
      timestamp: Date.now(),
    })
  } else if (msg.type === 'session_heartbeat') {
    sendMessage({
      id: msg.id,
      type: 'session_heartbeat',
      agentId: msg.agentId,
      timestamp: Date.now(),
    })
  }
})

setStatusHandler((connected) => {
  console.log(`[viyv-browser:SW] Native messaging: ${connected ? 'connected' : 'disconnected'}`)
})

// ── chrome.runtime.onMessage handler (C6) ──

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (message.type === 'viyv-get-status') {
      sendResponse({ connected: isConnected() })
    } else if (message.type === 'viyv-connect') {
      // Disconnect first to force a fresh native host process (re-discovers socket path)
      disconnectNative()
      connectNative()
      sendResponse({ connected: isConnected() })
    } else if (message.type === 'viyv-agent-stop') {
      console.log('[viyv-browser:SW] Agent stop requested')
      sendResponse({ acknowledged: true })
    }
    return true
  },
)

// ── chrome.runtime.onConnect handler (NM1) ──

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'viyv-event-observer') {
    port.onMessage.addListener((msg: unknown) => {
      sendMessage(msg)
    })
  }
})

// ── CDP Event Listeners for console/network buffering ──

// Track request methods from Network.requestWillBeSent
// L4 FIX: Cap size to prevent leak from cancelled/aborted requests
const requestMethods = new Map<string, string>()
const MAX_REQUEST_METHODS = 1000

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!source.tabId) return

  if (method === 'Runtime.consoleAPICalled') {
    const p = params as { type: string; args: Array<{ value?: string; description?: string }> }
    const text = p.args.map((a) => a.value ?? a.description ?? '').join(' ')
    addConsoleMessage(source.tabId, p.type, text)
  }

  if (method === 'Network.requestWillBeSent') {
    const p = params as { requestId: string; request: { method: string } }
    // L4 FIX: Evict oldest entries if map grows too large (aborted requests)
    if (requestMethods.size >= MAX_REQUEST_METHODS) {
      const first = requestMethods.keys().next().value
      if (first) requestMethods.delete(first)
    }
    requestMethods.set(p.requestId, p.request.method)
  }

  if (method === 'Network.responseReceived') {
    const p = params as {
      requestId: string
      response: { url: string; status: number }
      type: string
    }
    const httpMethod = requestMethods.get(p.requestId) ?? 'unknown'
    requestMethods.delete(p.requestId)
    addNetworkRequest(source.tabId, p.response.url, httpMethod, p.response.status)
  }
})

// ── Tab cleanup: free debug buffers when tabs are closed ──

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTabBuffers(tabId)
})

// ── Context menu for side panel ──

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {
  // Side panel API may not be available
})

console.log('[viyv-browser:SW] Service Worker initialized')
