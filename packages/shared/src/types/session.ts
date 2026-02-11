export interface AgentSession {
  agentId: string
  agentName: string
  sessionToken: string
  tabGroupId: number
  color: TabGroupColor
  tabs: number[]
  debuggerAttached: number[]
  tabLocks: Record<number, TabLock>
  eventSubscriptions: Record<string, EventSubscription>
  lastActivity: number
  status: 'active' | 'idle' | 'disconnected'
}

export interface TabLock {
  tabId: number
  agentId: string
  acquiredAt: number
  ttl: number
}

// FIX #9: Use BrowserEventType instead of string[] for type safety
import type { BrowserEventType } from './protocol.js'
import type { EventConditions } from './events.js'

export interface EventSubscription {
  id: string
  agentId: string
  eventTypes: BrowserEventType[]
  urlPattern?: string
  conditions?: EventConditions
  createdAt: number
}

export type TabGroupColor =
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange'
  | 'grey'

export const TAB_GROUP_COLORS: TabGroupColor[] = [
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
