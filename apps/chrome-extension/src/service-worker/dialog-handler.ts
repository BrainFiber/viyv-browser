import { sendCdpCommand } from './cdp-controller'

interface PendingDialog {
  tabId: number
  type: string
  message: string
  url: string
  timestamp: number
}

const pendingDialogs = new Map<number, PendingDialog>()

export function setupDialogHandler() {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method !== 'Page.javascriptDialogOpening' || !source.tabId) return

    const p = params as { type: string; message: string; url: string }
    pendingDialogs.set(source.tabId, {
      tabId: source.tabId,
      type: p.type,
      message: p.message,
      url: p.url,
      timestamp: Date.now(),
    })
  })
}

export function getPendingDialog(tabId: number): PendingDialog | undefined {
  return pendingDialogs.get(tabId)
}

export async function handleDialog(
  tabId: number,
  accept: boolean,
  promptText?: string,
): Promise<void> {
  const params: Record<string, unknown> = { accept }
  if (promptText !== undefined) params.promptText = promptText

  await sendCdpCommand(tabId, 'Page.handleJavaScriptDialog', params)
  pendingDialogs.delete(tabId)
}

export function hasPendingDialog(tabId: number): boolean {
  return pendingDialogs.has(tabId)
}
