/**
 * CDP Controller with lazy attach/detach.
 * FIX #4: Track active command count to prevent idle detach during execution.
 * FIX #5: Atomic lock (Promise-based) for ensureAttached to prevent race conditions.
 */

const CDP_COMMAND_TIMEOUT = 10_000
const CDP_IDLE_DETACH_DELAY = 5_000

const attachedTabs = new Set<number>()
const domainsEnabled = new Set<number>()
const idleTimers = new Map<number, ReturnType<typeof setTimeout>>()

// FIX #4: Track active commands per tab to prevent detach during execution
const activeCommandCounts = new Map<number, number>()

// FIX #5: Atomic lock for ensureAttached — prevents concurrent attach attempts
const attachPromises = new Map<number, Promise<void>>()

export async function ensureAttached(tabId: number): Promise<void> {
  clearIdleTimer(tabId)

  if (attachedTabs.has(tabId)) return

  // FIX #5: If an attach is already in progress for this tab, wait for it
  const existing = attachPromises.get(tabId)
  if (existing) return existing

  const promise = doAttach(tabId)
  attachPromises.set(tabId, promise)

  try {
    await promise
  } finally {
    attachPromises.delete(tabId)
  }
}

async function doAttach(tabId: number): Promise<void> {
  try {
    await chrome.debugger.attach({ tabId }, '1.3')
    attachedTabs.add(tabId)
    console.log(`[viyv-browser:SW] CDP attached to tab ${tabId}`)
    // Enable CDP domains for event monitoring
    await enableDomains(tabId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Already attached')) {
      attachedTabs.add(tabId)
      return
    }
    throw new Error(`Debugger attach failed for tab ${tabId}: ${message}`)
  }
}

async function enableDomains(tabId: number): Promise<void> {
  if (domainsEnabled.has(tabId)) return
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable')
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable')
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable')
    domainsEnabled.add(tabId)
  } catch {
    // Domains may fail to enable on some pages (chrome://, etc.)
  }
}

export async function sendCdpCommand<T = unknown>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  await ensureAttached(tabId)

  // FIX #4: Increment active command count
  activeCommandCounts.set(tabId, (activeCommandCounts.get(tabId) ?? 0) + 1)

  try {
    const result = await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP command '${method}' timed out after ${CDP_COMMAND_TIMEOUT}ms`))
      }, CDP_COMMAND_TIMEOUT)

      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        clearTimeout(timer)
        const error = chrome.runtime.lastError
        if (error) {
          reject(new Error(`CDP error: ${error.message}`))
        } else {
          resolve(result as T)
        }
      })
    })
    return result
  } finally {
    // FIX #4: Decrement active command count and reset idle timer only when no commands in flight
    const count = (activeCommandCounts.get(tabId) ?? 1) - 1
    if (count <= 0) {
      activeCommandCounts.delete(tabId)
      resetIdleTimer(tabId)
    } else {
      activeCommandCounts.set(tabId, count)
    }
  }
}

export async function detach(tabId: number): Promise<void> {
  clearIdleTimer(tabId)
  if (!attachedTabs.has(tabId)) return

  // FIX #4: Don't detach if commands are still in flight
  if ((activeCommandCounts.get(tabId) ?? 0) > 0) {
    resetIdleTimer(tabId)
    return
  }

  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // Tab may already be closed
  }
  attachedTabs.delete(tabId)
  // M1 FIX: Clear domainsEnabled so re-attach will re-enable CDP domains
  domainsEnabled.delete(tabId)
  console.log(`[viyv-browser:SW] CDP detached from tab ${tabId}`)
}

export function isAttached(tabId: number): boolean {
  return attachedTabs.has(tabId)
}

export function getAttachedTabs(): number[] {
  return Array.from(attachedTabs)
}

function resetIdleTimer(tabId: number) {
  clearIdleTimer(tabId)
  idleTimers.set(
    tabId,
    setTimeout(() => {
      detach(tabId)
    }, CDP_IDLE_DETACH_DELAY),
  )
}

function clearIdleTimer(tabId: number) {
  const timer = idleTimers.get(tabId)
  if (timer) {
    clearTimeout(timer)
    idleTimers.delete(tabId)
  }
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId)
  activeCommandCounts.delete(tabId)
  attachPromises.delete(tabId)
  domainsEnabled.delete(tabId)
  clearIdleTimer(tabId)
})

// Track external detach
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId)
    domainsEnabled.delete(source.tabId)
    clearIdleTimer(source.tabId)
  }
})
