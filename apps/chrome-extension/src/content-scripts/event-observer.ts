/**
 * Event observer content script.
 * NOT declaratively injected — only injected via chrome.scripting.executeScript
 * when an agent subscribes to browser events.
 *
 * Monitors: DOM mutations (selector-scoped), form submissions, performance events.
 */

interface ObserverConfig {
  agentId: string
  subscriptionId: string
  eventTypes: string[]
  selector?: string
  debounceMs?: number
}

let port: chrome.runtime.Port | null = null
let mutationObserver: MutationObserver | null = null
let performanceObserver: PerformanceObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let formSubmitHandler: ((e: Event) => void) | null = null

function getPort(): chrome.runtime.Port {
  if (!port || port === null) {
    port = chrome.runtime.connect({ name: 'viyv-event-observer' })
    port.onDisconnect.addListener(() => {
      port = null
    })
  }
  return port
}

function sendEvent(eventType: string, data: Record<string, unknown>) {
  try {
    getPort().postMessage({
      type: 'browser_event',
      eventType,
      data,
      url: window.location.href,
      timestamp: Date.now(),
    })
  } catch {
    // Port may be disconnected
  }
}

function setupMutationObserver(config: ObserverConfig) {
  if (!config.selector) return

  if (mutationObserver) mutationObserver.disconnect()

  const debounceMs = config.debounceMs ?? 500

  mutationObserver = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const matches = document.querySelectorAll(config.selector!)
      sendEvent('browser.dom_mutation', {
        subscriptionId: config.subscriptionId,
        selector: config.selector,
        matchCount: matches.length,
        agentId: config.agentId,
      })
    }, debounceMs)
  })

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'disabled'],
  })
}

function setupFormObserver(config: ObserverConfig) {
  if (formSubmitHandler) {
    document.removeEventListener('submit', formSubmitHandler, true)
  }
  formSubmitHandler = (event: Event) => {
    const form = event.target as HTMLFormElement
    sendEvent('browser.form_submitted', {
      subscriptionId: config.subscriptionId,
      action: form.action,
      method: form.method,
      agentId: config.agentId,
    })
  }
  document.addEventListener('submit', formSubmitHandler, true)
}

function setupPerformanceObserver(config: ObserverConfig) {
  performanceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'resource') {
        sendEvent('browser.network_request', {
          subscriptionId: config.subscriptionId,
          name: entry.name,
          duration: entry.duration,
          agentId: config.agentId,
        })
      }
    }
  })

  performanceObserver.observe({ entryTypes: ['resource'] })
}

// Receive configuration from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'viyv-setup-observer') {
    const config = message.config as ObserverConfig

    if (config.eventTypes.includes('browser.dom_mutation')) {
      setupMutationObserver(config)
    }
    if (config.eventTypes.includes('browser.form_submitted')) {
      setupFormObserver(config)
    }
    if (
      config.eventTypes.includes('browser.network_request') ||
      config.eventTypes.includes('browser.network_response')
    ) {
      setupPerformanceObserver(config)
    }
  }

  if (message.type === 'viyv-teardown-observer') {
    mutationObserver?.disconnect()
    performanceObserver?.disconnect()
    if (formSubmitHandler) {
      document.removeEventListener('submit', formSubmitHandler, true)
      formSubmitHandler = null
    }
    port?.disconnect()
    mutationObserver = null
    performanceObserver = null
    port = null
  }
})
