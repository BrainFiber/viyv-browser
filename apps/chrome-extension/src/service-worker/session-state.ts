interface SessionData {
  sessions: Record<string, StoredAgentSession>
  tabGroupMappings: Record<string, number>
  debuggerState: Record<number, string>
  pendingRequests: string[]
}

interface StoredAgentSession {
  agentId: string
  agentName: string
  tabGroupId: number
  color: string
  tabs: number[]
  status: 'active' | 'idle' | 'disconnected'
  lastActivity: number
}

const STORAGE_KEY = 'viyvBrowserSession'

export async function saveSessionState(data: Partial<SessionData>): Promise<void> {
  const existing = await loadSessionState()
  await chrome.storage.session.set({
    [STORAGE_KEY]: { ...existing, ...data },
  })
}

export async function loadSessionState(): Promise<SessionData> {
  const result = await chrome.storage.session.get(STORAGE_KEY)
  return (
    result[STORAGE_KEY] ?? {
      sessions: {},
      tabGroupMappings: {},
      debuggerState: {},
      pendingRequests: [],
    }
  )
}

export async function clearSessionState(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY)
}
