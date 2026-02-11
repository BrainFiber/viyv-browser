import { sendCdpCommand } from './cdp-controller'
import { getPendingDialog, handleDialog } from './dialog-handler'
import { checkPermission } from './permission-controller'
import { captureScreenshot } from './screenshot-capture'
import { getShortcuts } from './shortcut-registry'
import {
  acquireTabLock,
  assignTabGroup,
  cleanupStaleTabs,
  closeTab,
  createTabInGroup,
  getAgentGroup,
  isTabInAgentGroup,
  listAgentGroups,
  releaseTabLock,
} from './tab-manager'

type ToolResult =
  | { success: true; result: Record<string, unknown> }
  | { success: false; error: { code: string; message: string } }

// FIX #11: Sanitize ref IDs to prevent CSS selector injection via DOM attribute manipulation
const REF_PATTERN = /^(find_|page_)?ref_\d+$/
function sanitizeRef(ref: string): string {
  if (!REF_PATTERN.test(ref)) {
    throw new Error(`Invalid element ref format: ${ref}`)
  }
  return ref
}

// BUG-2 FIX: Screenshot storage for upload_image imageId lookup
// M2 FIX: Reduced limit to 10 to keep Service Worker memory under ~8MB
const screenshotStore = new Map<string, string>()
let screenshotCounter = 0
const MAX_STORED_SCREENSHOTS = 10

function storeScreenshot(data: string): string {
  const id = `screenshot_${++screenshotCounter}_${Date.now()}`
  screenshotStore.set(id, data)
  // Evict oldest entries to stay within limit
  while (screenshotStore.size > MAX_STORED_SCREENSHOTS) {
    const oldest = screenshotStore.keys().next().value
    if (oldest) screenshotStore.delete(oldest)
    else break
  }
  return id
}

function getScreenshotData(imageId: string): string {
  const data = screenshotStore.get(imageId)
  if (!data) {
    // Treat imageId as raw base64 data for backwards compatibility
    return imageId
  }
  return data
}

// Parse modifier keys string into CDP bitmask
function parseModifiers(modifiers?: string): number {
  if (!modifiers) return 0
  let mask = 0
  const parts = modifiers.toLowerCase().split('+')
  if (parts.includes('alt')) mask |= 1
  if (parts.includes('ctrl')) mask |= 2
  if (parts.includes('meta') || parts.includes('cmd')) mask |= 4
  if (parts.includes('shift')) mask |= 8
  return mask
}

function tabAccessCheck(agentId: string, tabId: number): string | null {
  if (!isTabInAgentGroup(agentId, tabId)) {
    return `Tab ${tabId} does not belong to agent ${agentId}`
  }
  return null
}

// NM4: Tools that require CDP and need TabLock
const CDP_TOOLS = new Set([
  'click',
  'type',
  'key',
  'scroll',
  'hover',
  'drag',
  'javascript_exec',
  'screenshot',
  'read_page',
  'find',
  'form_input',
  'get_page_text',
  'handle_dialog',
  'read_console_messages',
  'read_network_requests',
  'resize_window',
  'gif_creator',
  'artifact_from_page',
  'page_data_extract',
])

export async function handleToolCall(
  agentId: string,
  tool: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  // NM5: Permission check before dispatching
  const permitted = await checkPermission(agentId, tool, input)
  if (!permitted) {
    return {
      success: false,
      error: { code: 'PERMISSION_DENIED', message: `Permission denied for tool '${tool}'` },
    }
  }

  // NM4: Acquire TabLock for CDP tools
  const tabId = typeof input.tabId === 'number' ? input.tabId : undefined
  const needsLock = tabId !== undefined && CDP_TOOLS.has(tool)
  if (needsLock && !acquireTabLock(agentId, tabId)) {
    return {
      success: false,
      error: { code: 'TAB_LOCKED', message: `Tab ${tabId} is locked by another agent` },
    }
  }

  try {
    const result = await dispatchTool(agentId, tool, input)
    return { success: true, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = inferErrorCode(message)
    return { success: false, error: { code, message } }
  } finally {
    // NM4: Release TabLock after execution
    // BUG-6 FIX: tabId is guaranteed to be number when needsLock is true
    if (needsLock && tabId !== undefined) releaseTabLock(agentId, tabId)
  }
}

async function dispatchTool(
  agentId: string,
  tool: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Basic tabId validation
  if ('tabId' in input) {
    const tabId = input.tabId
    if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId < 0) {
      throw new Error(`Invalid tabId: ${tabId}`)
    }
  }

  switch (tool) {
    case 'navigate':
      return handleNavigate(agentId, input)
    case 'screenshot':
      return handleScreenshot(agentId, input)
    case 'click':
      return handleClick(agentId, input)
    case 'type':
      return handleType(agentId, input)
    case 'key':
      return handleKey(agentId, input)
    case 'scroll':
      return handleScroll(agentId, input)
    case 'hover':
      return handleHover(agentId, input)
    case 'drag':
      return handleDrag(agentId, input)
    case 'read_page':
      return handleReadPage(agentId, input)
    case 'find':
      return handleFind(agentId, input)
    case 'form_input':
      return handleFormInput(agentId, input)
    case 'javascript_exec':
      return handleJavaScriptExec(agentId, input)
    case 'wait_for':
      return handleWaitFor(agentId, input)
    case 'get_page_text':
      return handleGetPageText(agentId, input)
    case 'handle_dialog':
      return handleHandleDialog(agentId, input)
    case 'tabs_context':
      return handleTabsContext(agentId, input)
    case 'tabs_create':
      return handleTabsCreate(agentId, input)
    case 'tab_close':
      return handleTabClose(agentId, input)
    case 'select_tab':
      return handleSelectTab(agentId, input)
    case 'read_console_messages':
      return handleReadConsoleMessages(agentId, input)
    case 'read_network_requests':
      return handleReadNetworkRequests(agentId, input)
    case 'resize_window':
      return handleResizeWindow(agentId, input)
    case 'agent_tab_assign':
      return handleAgentTabAssign(agentId, input)
    case 'agent_tab_list':
      return handleAgentTabList()
    case 'browser_health':
      return handleBrowserHealth(agentId)
    case 'gif_creator':
      return handleGifCreator(agentId, input)
    case 'upload_image':
      return handleUploadImage(agentId, input)
    case 'update_plan':
      return handleUpdatePlan(agentId, input)
    case 'browser_event_subscribe':
      return handleBrowserEventSubscribe(agentId, input)
    case 'browser_event_unsubscribe':
      return handleBrowserEventUnsubscribe(agentId, input)
    case 'artifact_from_page':
      return handleArtifactFromPage(agentId, input)
    case 'page_data_extract':
      return handlePageDataExtract(agentId, input)
    case 'shortcuts_list':
      return handleShortcutsList()
    case 'shortcuts_execute':
      return handleShortcutsExecute(agentId, input)
    default:
      throw new Error(`Unknown tool: ${tool}`)
  }
}

// ── Core Tools ──

async function handleNavigate(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const url = input.url as string
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  // Validate URL scheme
  if (url !== 'back' && url !== 'forward') {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Unsupported URL scheme: ${parsed.protocol}`)
      }
    } catch (e) {
      if (e instanceof TypeError) {
        // Not a valid URL, let Chrome handle (it will error)
      } else throw e
    }
  }

  // FIX #3: Register listener BEFORE triggering navigation to avoid race condition
  const navigationComplete = new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        clearTimeout(timer)
        resolve()
      }
    }
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, 30_000)
    chrome.tabs.onUpdated.addListener(listener)
  })

  if (url === 'back') {
    await chrome.tabs.goBack(tabId)
  } else if (url === 'forward') {
    await chrome.tabs.goForward(tabId)
  } else {
    await chrome.tabs.update(tabId, { url })
  }

  await navigationComplete

  const tab = await chrome.tabs.get(tabId)
  return { url: tab.url, title: tab.title }
}

async function handleScreenshot(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const region = input.region as [number, number, number, number] | undefined
  const data = await captureScreenshot(tabId, {
    format: (input.format as 'jpeg' | 'png') ?? 'jpeg',
    quality: input.quality as number | undefined,
    region: region
      ? { x: region[0], y: region[1], width: region[2] - region[0], height: region[3] - region[1] }
      : undefined,
  })

  // BUG-2 FIX: Store screenshot for later use by upload_image
  const imageId = storeScreenshot(data)

  // M4 FIX: Add frame to active GIF recording for this agent
  const gifState = gifRecordings.get(agentId)
  if (gifState?.recording && gifState.frames.length < MAX_GIF_FRAMES) {
    gifState.frames.push({ data, timestamp: Date.now() })
  }

  return { data, format: input.format ?? 'jpeg', imageId }
}

async function handleClick(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  if (input.ref) {
    // Click via content script using element ref
    const ref = sanitizeRef(input.ref as string)
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (r: string) => {
        const el = document.querySelector(`[data-viyv-ref="${r}"]`) as HTMLElement
        if (!el) return { error: `Element ref ${r} not found` }
        el.click()
        return { clicked: true }
      },
      args: [ref],
    })
    const clickResult = result.result as Record<string, unknown>
    if (clickResult?.error) throw new Error(String(clickResult.error))
    return clickResult
  }

  // Click via CDP at coordinates
  const coord = input.coordinate as [number, number]
  const action = (input.action as string) ?? 'left_click'
  const button = action === 'right_click' ? 'right' : 'left'
  const clickCount = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1
  const modifiers = parseModifiers(input.modifiers as string)

  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: coord[0],
    y: coord[1],
    button,
    clickCount,
    modifiers,
  })
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: coord[0],
    y: coord[1],
    button,
    clickCount,
    modifiers,
  })

  return { clicked: true, coordinate: coord }
}

async function handleType(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const text = input.text as string
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  await sendCdpCommand(tabId, 'Input.insertText', { text })
  return { typed: text.length }
}

async function handleKey(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const keys = input.keys as string
  const repeat = (input.repeat as number) ?? 1
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  for (let i = 0; i < repeat; i++) {
    for (const keyCombo of keys.split(' ')) {
      const parts = keyCombo.split('+')
      const mainKey = parts.pop()!
      const modifiers = parseModifiers(parts.join('+'))

      await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: mainKey,
        modifiers,
      })
      await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: mainKey,
        modifiers,
      })
    }
  }

  return { pressed: keys, repeat }
}

async function handleScroll(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  // scroll_to mode: scroll element into view by ref
  if (input.ref) {
    const ref = sanitizeRef(input.ref as string)
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (r: string) => {
        const el = document.querySelector(`[data-viyv-ref="${r}"]`) as HTMLElement
        if (!el) return { error: `Element ref ${r} not found` }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const rect = el.getBoundingClientRect()
        return {
          scrolled: true,
          ref: r,
          boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        }
      },
      args: [ref],
    })
    const scrollResult = result.result as Record<string, unknown>
    if (scrollResult?.error) throw new Error(String(scrollResult.error))
    return scrollResult
  }

  // Directional scroll mode
  const coord = input.coordinate as [number, number]
  const direction = input.direction as string
  if (!coord || !direction) {
    throw new Error('Either "ref" or "coordinate" + "direction" must be provided')
  }
  const amount = (input.amount as number) ?? 3

  const deltaX = direction === 'left' ? -100 * amount : direction === 'right' ? 100 * amount : 0
  const deltaY = direction === 'up' ? -100 * amount : direction === 'down' ? 100 * amount : 0

  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: coord[0],
    y: coord[1],
    deltaX,
    deltaY,
  })

  return { scrolled: true, direction, amount }
}

async function handleHover(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const coord = input.coordinate as [number, number]
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: coord[0],
    y: coord[1],
  })

  return { hovered: true, coordinate: coord }
}

async function handleDrag(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const start = input.startCoordinate as [number, number]
  const end = input.endCoordinate as [number, number]
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: start[0],
    y: start[1],
    button: 'left',
  })
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: end[0],
    y: end[1],
  })
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: end[0],
    y: end[1],
    button: 'left',
  })

  return { dragged: true, from: start, to: end }
}

// NM8: Use existing accessibility-tree.ts content script via messaging instead of inline reimplementation
// Falls back to executeScript if content script is not loaded (chrome:// pages, PDFs, etc.)
async function handleReadPage(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const filter = input.filter as string | undefined
  const depth = (input.depth as number) ?? 8
  const maxChars = (input.maxChars as number) ?? 50_000
  const rawRefId = input.refId as string | undefined
  const refId = rawRefId ? sanitizeRef(rawRefId) : undefined

  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: 'viyv-build-a11y-tree',
      options: { filter, depth, maxChars, refId },
    })
    // M1 FIX: Content script responded — propagate its error directly, don't fallback
    if (result?.error) throw new Error(result.error)
    return result as Record<string, unknown>
  } catch (err) {
    // Only fallback for connection errors (content script not loaded)
    const msg = err instanceof Error ? err.message : ''
    if (
      msg &&
      !msg.includes('Receiving end does not exist') &&
      !msg.includes('Could not establish connection')
    ) {
      throw err
    }
    // Fallback: inject script directly when content script is not available
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (opts: { filter?: string; depth: number; maxChars: number; refId?: string }) => {
        let refCounter = 0
        function walk(el: Element, d: number, maxD: number, interactive: boolean): string {
          if (d > maxD) return ''
          const tag = el.tagName.toLowerCase()
          const isInt =
            ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ||
            el.hasAttribute('onclick') ||
            el.getAttribute('role') === 'button'
          if (interactive && !isInt && el.children.length === 0) return ''
          const ref = `page_ref_${refCounter++}`
          ;(el as HTMLElement).dataset.viyvRef = ref
          const indent = '  '.repeat(d)
          let line = `${indent}[${ref}] ${el.getAttribute('role') || tag}`
          if (el.children.length === 0) {
            const text = el.textContent?.trim()
            if (text) line += `: ${text.slice(0, 100)}`
          }
          let out = `${line}\n`
          for (const child of el.children) out += walk(child, d + 1, maxD, interactive)
          return out
        }
        const root = opts.refId
          ? document.querySelector(`[data-viyv-ref="${opts.refId}"]`)
          : document.body
        if (!root) return { error: 'Root element not found' }
        const tree = walk(root, 0, opts.depth, opts.filter === 'interactive')
        return { tree: tree.slice(0, opts.maxChars) }
      },
      args: [{ filter, depth, maxChars, refId }],
    })
    const fallbackResult = result.result as Record<string, unknown>
    if (fallbackResult?.error) throw new Error(String(fallbackResult.error))
    return fallbackResult
  }
}

// NM8: Use existing accessibility-tree.ts content script via messaging
// Falls back to executeScript if content script is not loaded
async function handleFind(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const query = input.query as string
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: 'viyv-find-elements',
      query,
    })
    return result as Record<string, unknown>
  } catch (err) {
    // M1 FIX: Only fallback for connection errors (content script not loaded)
    const msg = err instanceof Error ? err.message : ''
    if (
      msg &&
      !msg.includes('Receiving end does not exist') &&
      !msg.includes('Could not establish connection')
    ) {
      throw err
    }
    // Fallback: inject script directly when content script is not available
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (q: string) => {
        const matches: Array<{ ref: string; tag: string; text: string; role: string }> = []
        const lowerQ = q.toLowerCase()
        let refCounter = 0
        for (const el of document.querySelectorAll('*')) {
          if (matches.length >= 20) break
          const text = el.textContent?.trim() || ''
          const ariaLabel = el.getAttribute('aria-label') || ''
          const placeholder = el.getAttribute('placeholder') || ''
          const title = el.getAttribute('title') || ''
          const searchable = `${text} ${ariaLabel} ${placeholder} ${title}`.toLowerCase()
          if (searchable.includes(lowerQ)) {
            const ref = `find_ref_${refCounter++}`
            ;(el as HTMLElement).dataset.viyvRef = ref
            matches.push({
              ref,
              tag: el.tagName.toLowerCase(),
              text: text.slice(0, 100),
              role: el.getAttribute('role') || el.tagName.toLowerCase(),
            })
          }
        }
        return { matches, total: matches.length }
      },
      args: [query],
    })
    return result.result as Record<string, unknown>
  }
}

async function handleFormInput(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const ref = sanitizeRef(input.ref as string)
  const value = input.value
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (r: string, v: unknown) => {
      const el = document.querySelector(`[data-viyv-ref="${r}"]`) as HTMLInputElement
      if (!el) return { error: `Element ref ${r} not found` }

      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = Boolean(v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else if (el.tagName === 'SELECT') {
        ;(el as unknown as HTMLSelectElement).value = String(v)
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        el.value = String(v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return { set: true }
    },
    args: [ref, value],
  })

  return result.result as Record<string, unknown>
}

async function handleJavaScriptExec(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const code = input.code as string
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const cdpResult = await sendCdpCommand<{
    result: { value: unknown }
    exceptionDetails?: {
      exception?: { description?: string }
      text?: string
    }
  }>(tabId, 'Runtime.evaluate', {
    expression: code,
    returnByValue: true,
    awaitPromise: true,
  })

  if (cdpResult.exceptionDetails) {
    const desc =
      cdpResult.exceptionDetails.exception?.description ??
      cdpResult.exceptionDetails.text ??
      'Unknown error'
    throw new Error(`JavaScript error: ${desc}`)
  }

  return { result: cdpResult.result?.value }
}

async function handleWaitFor(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const selector = input.selector as string | undefined
  const navigation = input.navigation as boolean | undefined
  const timeout = (input.timeout as number) ?? 30_000
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  if (navigation) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener)
        reject(new Error(`Navigation wait timed out after ${timeout}ms`))
      }, timeout)

      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer)
          chrome.tabs.onUpdated.removeListener(listener)
          resolve()
        }
      }
      chrome.tabs.onUpdated.addListener(listener)
    })
    return { waited: 'navigation' }
  }

  if (selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel: string, ms: number) => {
        return new Promise<{ found: boolean }>((resolve) => {
          const existing = document.querySelector(sel)
          if (existing) {
            resolve({ found: true })
            return
          }
          const observer = new MutationObserver(() => {
            if (document.querySelector(sel)) {
              observer.disconnect()
              resolve({ found: true })
            }
          })
          observer.observe(document.body, { childList: true, subtree: true })
          setTimeout(() => {
            observer.disconnect()
            resolve({ found: false })
          }, ms)
        })
      },
      args: [selector, timeout],
    })
    return result.result as Record<string, unknown>
  }

  // NL2: Require explicit timeout if neither selector nor navigation is specified
  const explicitTimeout = input.timeout as number | undefined
  if (explicitTimeout === undefined) {
    throw new Error('Either "selector", "navigation", or an explicit "timeout" must be specified')
  }
  await new Promise((resolve) => setTimeout(resolve, explicitTimeout))
  return { waited: explicitTimeout, type: 'delay' }
}

async function handleGetPageText(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Try to get article content first, fall back to body
      const article = document.querySelector('article') || document.querySelector('main')
      const root = article || document.body
      return { text: root.innerText.slice(0, 100_000) }
    },
  })

  return result.result as Record<string, unknown>
}

async function handleHandleDialog(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)
  const action = input.action as string
  const text = input.text as string | undefined

  const dialog = getPendingDialog(tabId)
  if (!dialog) {
    return { handled: false, message: 'No pending dialog' }
  }

  await handleDialog(tabId, action === 'accept', text)
  return { handled: true, dialogType: dialog.type, dialogMessage: dialog.message }
}

// ── Tab Tools ──

async function handleTabsContext(agentId: string, input: Record<string, unknown>) {
  const createIfEmpty = input.createIfEmpty as boolean | undefined
  let group = getAgentGroup(agentId)

  if (!group && createIfEmpty) {
    group = await assignTabGroup(agentId, agentId)
  }

  if (!group) {
    return { tabs: [], groupId: null }
  }

  const staleTabs: number[] = []
  const tabs = await Promise.all(
    Array.from(group.tabs).map(async (tabId) => {
      try {
        const tab = await chrome.tabs.get(tabId)
        return { tabId, url: tab.url, title: tab.title, active: tab.active }
      } catch {
        staleTabs.push(tabId)
        return null
      }
    }),
  )

  // NL1: Persist stale tab removal
  if (staleTabs.length > 0) {
    cleanupStaleTabs(agentId, staleTabs)
  }

  return {
    groupId: group.groupId,
    color: group.color,
    agentName: group.agentName,
    tabs: tabs.filter(Boolean),
  }
}

async function handleTabsCreate(agentId: string, input: Record<string, unknown>) {
  const url = input.url as string | undefined
  let group = getAgentGroup(agentId)

  if (!group) {
    group = await assignTabGroup(agentId, agentId)
  }

  const tabId = await createTabInGroup(agentId, url)
  const tab = await chrome.tabs.get(tabId)
  return { tabId, url: tab.url, title: tab.title }
}

async function handleTabClose(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  await closeTab(agentId, tabId)
  return { closed: true, tabId }
}

async function handleSelectTab(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  await chrome.tabs.update(tabId, { active: true })
  const tab = await chrome.tabs.get(tabId)
  return { selected: true, tabId, url: tab.url, title: tab.title }
}

// ── Debug Tools ──

// FIX #10: Global buffer limits to prevent unbounded memory growth
const MAX_ENTRIES_PER_TAB = 500
const MAX_TOTAL_ENTRIES = 5000

const consoleBuffers = new Map<number, Array<{ level: string; text: string; timestamp: number }>>()
const networkBuffers = new Map<
  number,
  Array<{ url: string; method: string; status: number; timestamp: number }>
>()

function getTotalBufferSize(buffers: Map<number, unknown[]>): number {
  let total = 0
  for (const buf of buffers.values()) total += buf.length
  return total
}

function evictOldestEntries(buffers: Map<number, Array<{ timestamp: number }>>) {
  // Find the tab with the oldest entry and remove it
  let oldestTab = -1
  let oldestTime = Number.POSITIVE_INFINITY
  for (const [tabId, buf] of buffers) {
    if (buf.length > 0 && buf[0].timestamp < oldestTime) {
      oldestTime = buf[0].timestamp
      oldestTab = tabId
    }
  }
  if (oldestTab >= 0) {
    const buf = buffers.get(oldestTab)!
    buf.shift()
    if (buf.length === 0) buffers.delete(oldestTab)
  }
}

export function addConsoleMessage(tabId: number, level: string, text: string) {
  if (!consoleBuffers.has(tabId)) consoleBuffers.set(tabId, [])
  const buf = consoleBuffers.get(tabId)!
  buf.push({ level, text, timestamp: Date.now() })
  if (buf.length > MAX_ENTRIES_PER_TAB) buf.shift()
  while (getTotalBufferSize(consoleBuffers) > MAX_TOTAL_ENTRIES) {
    evictOldestEntries(consoleBuffers)
  }
}

export function addNetworkRequest(tabId: number, url: string, method: string, status: number) {
  if (!networkBuffers.has(tabId)) networkBuffers.set(tabId, [])
  const buf = networkBuffers.get(tabId)!
  buf.push({ url, method, status, timestamp: Date.now() })
  if (buf.length > MAX_ENTRIES_PER_TAB) buf.shift()
  while (getTotalBufferSize(networkBuffers) > MAX_TOTAL_ENTRIES) {
    evictOldestEntries(networkBuffers)
  }
}

// FIX #10: Clean up buffers when tabs are closed
export function cleanupTabBuffers(tabId: number) {
  consoleBuffers.delete(tabId)
  networkBuffers.delete(tabId)
}

// M2 FIX: Clean up agent-scoped state on session close
export function cleanupAgentState(agentId: string) {
  gifRecordings.delete(agentId)
}

async function handleReadConsoleMessages(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const pattern = input.pattern as string | undefined
  const onlyErrors = input.onlyErrors as boolean | undefined
  const limit = (input.limit as number) ?? 100
  const clear = input.clear as boolean | undefined
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  let messages = consoleBuffers.get(tabId) ?? []

  if (onlyErrors) {
    messages = messages.filter((m) => m.level === 'error' || m.level === 'exception')
  }

  if (pattern) {
    try {
      const re = new RegExp(pattern)
      messages = messages.filter((m) => re.test(m.text))
    } catch {
      messages = messages.filter((m) => m.text.includes(pattern))
    }
  }

  const result = messages.slice(-limit)
  if (clear) consoleBuffers.delete(tabId)

  return { messages: result, total: result.length }
}

async function handleReadNetworkRequests(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const urlPattern = input.urlPattern as string | undefined
  const limit = (input.limit as number) ?? 100
  const clear = input.clear as boolean | undefined
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  let requests = networkBuffers.get(tabId) ?? []

  if (urlPattern) {
    requests = requests.filter((r) => r.url.includes(urlPattern))
  }

  const result = requests.slice(-limit)
  if (clear) networkBuffers.delete(tabId)

  return { requests: result, total: result.length }
}

// ── Advanced Tools ──

async function handleResizeWindow(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const width = input.width as number
  const height = input.height as number
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const tab = await chrome.tabs.get(tabId)
  await chrome.windows.update(tab.windowId, { width, height })
  return { resized: true, width, height }
}

// ── viyv Integration Tools ──

async function handleAgentTabAssign(_agentId: string, input: Record<string, unknown>) {
  const targetAgentId = input.agentId as string
  const agentName = input.agentName as string
  const color = input.color as string | undefined

  const group = await assignTabGroup(targetAgentId, agentName, color)
  return {
    agentId: targetAgentId,
    agentName,
    groupId: group.groupId,
    color: group.color,
    tabs: Array.from(group.tabs),
  }
}

async function handleAgentTabList() {
  const groups = listAgentGroups()
  return {
    agents: groups.map((g) => ({
      agentId: g.agentId,
      agentName: g.agentName,
      groupId: g.groupId,
      color: g.color,
      tabs: Array.from(g.tabs),
    })),
  }
}

async function handleBrowserHealth(agentId: string) {
  const group = getAgentGroup(agentId)
  const allGroups = listAgentGroups()
  return {
    connected: true,
    agentId,
    currentGroup: group
      ? { groupId: group.groupId, tabs: Array.from(group.tabs), color: group.color }
      : null,
    totalSessions: allGroups.length,
    extensionVersion: chrome.runtime.getManifest().version,
  }
}

// ── NH1: Newly Implemented Tools ──

// GIF recording state per agent
// BUG-5 FIX: Limit frame count to prevent OOM
const MAX_GIF_FRAMES = 200
const gifRecordings = new Map<
  string,
  {
    recording: boolean
    frames: Array<{ data: string; timestamp: number }>
    tabId: number
  }
>()

async function handleGifCreator(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const action = input.action as string
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  switch (action) {
    case 'start_recording': {
      // Capture initial frame
      const initialFrame = await captureScreenshot(tabId, { format: 'jpeg', quality: 60 })
      gifRecordings.set(agentId, {
        recording: true,
        frames: [{ data: initialFrame, timestamp: Date.now() }],
        tabId,
      })
      return { recording: true, message: 'Recording started' }
    }
    case 'stop_recording': {
      const state = gifRecordings.get(agentId)
      if (!state) throw new Error('No recording in progress')
      // Capture final frame (respect limit)
      if (state.frames.length < MAX_GIF_FRAMES) {
        const finalFrame = await captureScreenshot(tabId, { format: 'jpeg', quality: 60 })
        state.frames.push({ data: finalFrame, timestamp: Date.now() })
      }
      state.recording = false
      return { recording: false, frameCount: state.frames.length }
    }
    case 'export': {
      const state = gifRecordings.get(agentId)
      if (!state || state.frames.length === 0) throw new Error('No frames to export')
      const filename = (input.filename as string) ?? `recording-${Date.now()}.gif`
      const download = input.download as boolean | undefined
      // Send frames to offscreen document for GIF encoding
      await chrome.offscreen
        .createDocument({
          url: 'src/offscreen/offscreen.html',
          reasons: [chrome.offscreen.Reason.BLOBS],
          justification: 'GIF encoding',
        })
        .catch(() => {
          /* already exists */
        })
      const gifResult = await chrome.runtime.sendMessage({
        type: 'viyv-gif-encode',
        frames: state.frames,
        options: input.options ?? {},
        filename,
        download: download ?? false,
      })
      // L3 FIX: Validate offscreen document response before spreading
      if (gifResult?.error) {
        throw new Error(`GIF encoding failed: ${gifResult.error}`)
      }
      const gifData = gifResult && typeof gifResult === 'object' ? gifResult : {}
      return { exported: true, filename, frameCount: state.frames.length, ...gifData }
    }
    case 'clear': {
      gifRecordings.delete(agentId)
      return { cleared: true }
    }
    default:
      throw new Error(`Unknown gif_creator action: ${action}`)
  }
}

async function handleUploadImage(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const imageId = input.imageId as string
  const ref = input.ref as string | undefined
  const coordinate = input.coordinate as [number, number] | undefined
  const filename = (input.filename as string) ?? 'image.png'
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  if (!ref && !coordinate) {
    throw new Error('Either "ref" or "coordinate" must be specified')
  }

  // BUG-2 FIX: Resolve imageId from screenshot store (falls back to raw base64)
  const imgData = getScreenshotData(imageId)

  // L3 FIX: Detect MIME type from filename extension
  const mimeType =
    filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'

  if (ref) {
    const safeRef = sanitizeRef(ref)
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (r: string, data: string, fname: string, mime: string) => {
        const el = document.querySelector(`[data-viyv-ref="${r}"]`) as HTMLInputElement
        if (!el) return { error: `Element ref ${r} not found` }

        // Convert base64 to File and set on file input
        const byteChars = atob(data)
        const bytes = new Uint8Array(byteChars.length)
        for (let i = 0; i < byteChars.length; i++) {
          bytes[i] = byteChars.charCodeAt(i)
        }
        const file = new File([bytes], fname, { type: mime })
        const dt = new DataTransfer()
        dt.items.add(file)
        el.files = dt.files
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { uploaded: true }
      },
      args: [safeRef, imgData, filename, mimeType],
    })
    const uploadResult = result.result as Record<string, unknown>
    if (uploadResult?.error) throw new Error(String(uploadResult.error))
    return uploadResult
  }

  // BUG-3 FIX: Coordinate-based drag & drop with full event sequence
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (data: string, x: number, y: number, fname: string, mime: string) => {
      const byteChars = atob(data)
      const bytes = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i)
      }
      const file = new File([bytes], fname, { type: mime })
      const dt = new DataTransfer()
      dt.items.add(file)

      const target = document.elementFromPoint(x, y)
      if (!target) return { error: 'No element at coordinates' }

      // Full drag & drop event sequence required for proper handling
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }))
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      return { uploaded: true, target: target.tagName.toLowerCase() }
    },
    args: [imgData, coordinate![0], coordinate![1], filename, mimeType],
  })
  return result.result as Record<string, unknown>
}

// L2 FIX: Plans are informational — no need to store in Extension memory
async function handleUpdatePlan(_agentId: string, input: Record<string, unknown>) {
  const domains = input.domains as string[]
  const approach = input.approach as string[]
  return { updated: true, domains, approach }
}

// L1 FIX: Subscriptions are managed by MCP server's event-bridge (BUG-4 fix).
// Extension only generates IDs and returns them; server.ts syncs with event-bridge.
let subCounter = 0

async function handleBrowserEventSubscribe(agentId: string, input: Record<string, unknown>) {
  const eventTypes = input.eventTypes as string[]
  const urlPattern = input.urlPattern as string | undefined

  const id = `sub_${agentId}_${++subCounter}_${Date.now()}`
  return { subscriptionId: id, eventTypes, urlPattern }
}

async function handleBrowserEventUnsubscribe(_agentId: string, input: Record<string, unknown>) {
  const subscriptionId = input.subscriptionId as string
  return { unsubscribed: true, subscriptionId }
}

async function handleArtifactFromPage(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const type = input.type as string
  const title = input.title as string | undefined
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  if (type === 'screenshot') {
    const data = await captureScreenshot(tabId, { format: 'png' })
    return { type: 'screenshot', title: title ?? 'Screenshot', data, format: 'png' }
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (artifactType: string) => {
      if (artifactType === 'html') {
        return { content: document.documentElement.outerHTML.slice(0, 500_000) }
      }
      const article = document.querySelector('article') || document.querySelector('main')
      const root = article || document.body
      return { content: root.innerText.slice(0, 200_000) }
    },
    args: [type],
  })

  const content = result.result as Record<string, unknown>
  return { type, title: title ?? `Page ${type}`, ...content }
}

async function handlePageDataExtract(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const schema = input.schema as Record<string, unknown>
  const selector = input.selector as string | undefined
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (schemaObj: Record<string, unknown>, sel?: string) => {
      const root = sel ? document.querySelector(sel) : document.body
      if (!root) return { error: `Selector "${sel}" not found` }

      const extracted: Record<string, unknown> = {}
      for (const [key, descriptor] of Object.entries(schemaObj)) {
        const desc = descriptor as { selector?: string; attribute?: string; multiple?: boolean }
        if (desc.selector) {
          if (desc.multiple) {
            const els = root.querySelectorAll(desc.selector)
            extracted[key] = Array.from(els).map((el) =>
              desc.attribute ? el.getAttribute(desc.attribute) : el.textContent?.trim(),
            )
          } else {
            const el = root.querySelector(desc.selector)
            extracted[key] = el
              ? desc.attribute
                ? el.getAttribute(desc.attribute)
                : el.textContent?.trim()
              : null
          }
        }
      }
      return { data: extracted }
    },
    args: [schema, selector],
  })

  const extractResult = result.result as Record<string, unknown>
  if (extractResult?.error) throw new Error(String(extractResult.error))
  return extractResult
}

// ── Shortcut Tools ──

async function handleShortcutsList() {
  const shortcuts = await getShortcuts()
  return {
    shortcuts,
    message: shortcuts.length > 0 ? `Found ${shortcuts.length} shortcut(s)` : 'No shortcuts found',
  }
}

async function handleShortcutsExecute(agentId: string, input: Record<string, unknown>) {
  const tabId = input.tabId as number
  const command = input.command as string | undefined
  const shortcutId = input.shortcutId as string | undefined
  const accessErr = tabAccessCheck(agentId, tabId)
  if (accessErr) throw new Error(accessErr)

  if (!command && !shortcutId) {
    throw new Error('Either "command" or "shortcutId" must be provided')
  }

  const shortcuts = await getShortcuts()
  const shortcut = shortcuts.find(
    (s) => (command && s.command === command) || (shortcutId && s.id === shortcutId),
  )
  if (!shortcut) {
    throw new Error(
      `Shortcut not found: ${command ? `command="${command}"` : `id="${shortcutId}"`}`,
    )
  }

  // Open side panel and send shortcut info
  await chrome.sidePanel.open({ tabId })
  // Send shortcut execution message to the side panel
  chrome.runtime
    .sendMessage({
      type: 'viyv-shortcut-execute',
      shortcut,
      tabId,
    })
    .catch(() => {
      // Side panel may not be ready yet; that's OK
    })

  return { started: true, shortcutId: shortcut.id, command: shortcut.command }
}

function inferErrorCode(message: string): string {
  if (message.includes('does not belong to agent')) return 'TAB_ACCESS_DENIED'
  if (message.includes('not found') || message.includes('No tab')) return 'TAB_NOT_FOUND'
  if (message.includes('attach failed')) return 'DEBUGGER_ATTACH_FAILED'
  if (message.includes('CDP error')) return 'CDP_ERROR'
  if (message.includes('timed out')) return 'TIMEOUT'
  if (message.includes('Unknown tool')) return 'UNKNOWN_TOOL'
  return 'INTERNAL_ERROR'
}
