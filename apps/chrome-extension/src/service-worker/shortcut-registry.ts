export interface Shortcut {
  id: string
  command: string
  description: string
  isWorkflow: boolean
  startUrl?: string
}

const STORAGE_KEY = 'viyv-shortcuts'

export async function getShortcuts(): Promise<Shortcut[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as Shortcut[]) ?? []
}

export async function registerShortcut(shortcut: Shortcut): Promise<void> {
  const shortcuts = await getShortcuts()
  const idx = shortcuts.findIndex((s) => s.id === shortcut.id)
  if (idx >= 0) {
    shortcuts[idx] = shortcut
  } else {
    shortcuts.push(shortcut)
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: shortcuts })
}

export async function removeShortcut(id: string): Promise<boolean> {
  const shortcuts = await getShortcuts()
  const filtered = shortcuts.filter((s) => s.id !== id)
  if (filtered.length === shortcuts.length) return false
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered })
  return true
}
