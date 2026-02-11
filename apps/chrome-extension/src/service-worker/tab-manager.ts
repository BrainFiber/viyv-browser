import { loadSessionState, saveSessionState } from './session-state'

type TabGroupColor = chrome.tabGroups.ColorEnum

const TAB_GROUP_COLORS: TabGroupColor[] = [
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
  'grey',
]

interface AgentTabGroup {
  agentId: string
  agentName: string
  groupId: number
  color: TabGroupColor
  tabs: Set<number>
}

const agentGroups = new Map<string, AgentTabGroup>()
const tabToAgent = new Map<number, string>()

// ── TabLock: mutex for concurrent CDP access (NM4) ──

interface TabLockInfo {
  tabId: number
  agentId: string
  acquiredAt: number
  ttl: number
}

const tabLocks = new Map<number, TabLockInfo>()

export function acquireTabLock(agentId: string, tabId: number, ttl = 60_000): boolean {
  const existing = tabLocks.get(tabId)
  if (existing) {
    if (Date.now() - existing.acquiredAt > existing.ttl) {
      tabLocks.delete(tabId)
    } else if (existing.agentId !== agentId) {
      return false
    } else {
      existing.acquiredAt = Date.now()
      return true
    }
  }
  tabLocks.set(tabId, { tabId, agentId, acquiredAt: Date.now(), ttl })
  return true
}

export function releaseTabLock(agentId: string, tabId: number): void {
  const lock = tabLocks.get(tabId)
  if (lock && lock.agentId === agentId) {
    tabLocks.delete(tabId)
  }
}

function serializeGroups(): Record<string, unknown>[] {
  return Array.from(agentGroups.entries()).map(([_id, g]) => ({
    agentId: g.agentId,
    agentName: g.agentName,
    groupId: g.groupId,
    color: g.color,
    tabs: Array.from(g.tabs),
  }))
}

function persistGroups(): void {
  // Groups are serialized as arrays but SessionData.sessions expects a Record;
  // initTabManager handles both formats on load
  saveSessionState({ sessions: serializeGroups() } as never).catch(() => {})
}

export async function initTabManager(): Promise<void> {
  const state = await loadSessionState()
  if (state?.sessions && typeof state.sessions === 'object') {
    // sessions may be stored as an array of serialized groups
    const groups = Array.isArray(state.sessions)
      ? (state.sessions as unknown as Array<Record<string, unknown>>)
      : Object.values(state.sessions)
    for (const g of groups) {
      if (g && typeof g === 'object' && 'agentId' in g) {
        const tabArray = Array.isArray((g as Record<string, unknown>).tabs)
          ? ((g as Record<string, unknown>).tabs as number[])
          : []
        const group: AgentTabGroup = {
          agentId: g.agentId as string,
          agentName: (g as Record<string, unknown>).agentName as string,
          groupId: (g as Record<string, unknown>).groupId as number,
          color: (g as Record<string, unknown>).color as TabGroupColor,
          tabs: new Set(tabArray),
        }
        agentGroups.set(group.agentId, group)
        for (const tabId of tabArray) {
          tabToAgent.set(tabId, group.agentId)
        }
      }
    }
  }
}

export async function assignTabGroup(
  agentId: string,
  agentName: string,
  preferredColor?: string,
): Promise<AgentTabGroup> {
  const existing = agentGroups.get(agentId)
  if (existing) {
    // Validate the Chrome tab group still exists (may be stale after browser restart)
    try {
      await chrome.tabGroups.get(existing.groupId)
      return existing
    } catch {
      // Group no longer exists — clean up stale state and recreate below
      for (const tabId of existing.tabs) {
        tabToAgent.delete(tabId)
      }
      agentGroups.delete(agentId)
    }
  }

  const color = selectColor(preferredColor)
  const tab = await chrome.tabs.create({ active: false })
  if (tab.id === undefined) throw new Error('Tab creation failed: no tab ID')
  const groupId = await chrome.tabs.group({ tabIds: tab.id })
  await chrome.tabGroups.update(groupId, { title: agentName, color })

  const group: AgentTabGroup = {
    agentId,
    agentName,
    groupId,
    color,
    tabs: new Set([tab.id]),
  }

  agentGroups.set(agentId, group)
  tabToAgent.set(tab.id, agentId)
  persistGroups()
  return group
}

export async function createTabInGroup(agentId: string, url?: string): Promise<number> {
  let group = agentGroups.get(agentId)
  if (!group) throw new Error(`No tab group for agent ${agentId}`)

  const tab = await chrome.tabs.create({ url, active: false })
  if (tab.id === undefined) throw new Error('Tab creation failed: no tab ID')

  try {
    await chrome.tabs.group({ tabIds: tab.id, groupId: group.groupId })
  } catch {
    // Tab group no longer exists — recreate it
    const newGroupId = await chrome.tabs.group({ tabIds: tab.id })
    await chrome.tabGroups.update(newGroupId, { title: group.agentName, color: group.color })
    group.groupId = newGroupId
    group = agentGroups.get(agentId)!
  }

  group.tabs.add(tab.id)
  tabToAgent.set(tab.id, agentId)
  persistGroups()
  return tab.id
}

export async function closeTab(agentId: string, tabId: number): Promise<void> {
  const group = agentGroups.get(agentId)
  if (!group || !group.tabs.has(tabId)) {
    throw new Error(`Tab ${tabId} does not belong to agent ${agentId}`)
  }
  await chrome.tabs.remove(tabId)
  group.tabs.delete(tabId)
  tabToAgent.delete(tabId)
  persistGroups()
}

export function getAgentForTab(tabId: number): string | undefined {
  return tabToAgent.get(tabId)
}

export function getAgentGroup(agentId: string): AgentTabGroup | undefined {
  return agentGroups.get(agentId)
}

export function isTabInAgentGroup(agentId: string, tabId: number): boolean {
  const group = agentGroups.get(agentId)
  return group?.tabs.has(tabId) ?? false
}

export function listAgentGroups(): AgentTabGroup[] {
  return Array.from(agentGroups.values())
}

export async function removeAgentGroup(agentId: string): Promise<void> {
  const group = agentGroups.get(agentId)
  if (!group) return

  for (const tabId of group.tabs) {
    try {
      await chrome.tabs.remove(tabId)
    } catch {
      // Tab may already be closed
    }
    tabToAgent.delete(tabId)
  }
  agentGroups.delete(agentId)
  persistGroups()
}

function selectColor(preferred?: string): TabGroupColor {
  if (preferred && TAB_GROUP_COLORS.includes(preferred as TabGroupColor)) {
    return preferred as TabGroupColor
  }

  const usedColors = new Set(Array.from(agentGroups.values()).map((g) => g.color))
  const available = TAB_GROUP_COLORS.filter((c) => !usedColors.has(c))
  return available[0] ?? TAB_GROUP_COLORS[0]
}

// NL1: Export cleanup for stale tabs discovered by handleTabsContext
export function cleanupStaleTabs(agentId: string, staleTabs: number[]): void {
  const group = agentGroups.get(agentId)
  if (!group || staleTabs.length === 0) return
  for (const tabId of staleTabs) {
    group.tabs.delete(tabId)
    tabToAgent.delete(tabId)
    tabLocks.delete(tabId)
  }
  persistGroups()
}

// Track tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  const agentId = tabToAgent.get(tabId)
  if (agentId) {
    const group = agentGroups.get(agentId)
    group?.tabs.delete(tabId)
    tabToAgent.delete(tabId)
    tabLocks.delete(tabId)
    persistGroups()
  }
})
