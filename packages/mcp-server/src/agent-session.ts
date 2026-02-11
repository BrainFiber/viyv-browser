/**
 * Multi-agent session management.
 * Tracks which agents are connected and their session tokens.
 */

import { randomUUID } from 'node:crypto'

interface AgentSessionInfo {
  agentId: string
  sessionToken: string
  agentName: string
  status: 'active' | 'idle' | 'disconnected'
  lastActivity: number
  createdAt: number
}

const sessions = new Map<string, AgentSessionInfo>()
let configuredDefaultAgentId = 'default'

export function setDefaultAgentId(id: string): void {
  configuredDefaultAgentId = id
}

export function createSession(agentId: string, agentName?: string): AgentSessionInfo {
  const existing = sessions.get(agentId)
  if (existing) {
    existing.lastActivity = Date.now()
    existing.status = 'active'
    return existing
  }

  const session: AgentSessionInfo = {
    agentId,
    sessionToken: randomUUID(),
    agentName: agentName ?? agentId,
    status: 'active',
    lastActivity: Date.now(),
    createdAt: Date.now(),
  }

  sessions.set(agentId, session)
  return session
}

export function getSession(agentId: string): AgentSessionInfo | undefined {
  return sessions.get(agentId)
}

export function validateSession(agentId: string, sessionToken: string): boolean {
  const session = sessions.get(agentId)
  return session?.sessionToken === sessionToken
}

export function touchSession(agentId: string): void {
  const session = sessions.get(agentId)
  if (session) {
    session.lastActivity = Date.now()
  }
}

export function closeSession(agentId: string): void {
  sessions.delete(agentId)
}

export function listSessions(): AgentSessionInfo[] {
  return Array.from(sessions.values())
}

export function getDefaultAgentId(): string {
  // Return the first active session, or create a default
  const active = Array.from(sessions.values()).find((s) => s.status === 'active')
  if (active) return active.agentId

  const defaultSession = createSession(configuredDefaultAgentId)
  return defaultSession.agentId
}

const STALE_SESSION_TTL = 5 * 60 * 1000 // 5 minutes
const CLEANUP_INTERVAL = 60 * 1000 // Check every minute

export function cleanupStaleSessions(): number {
  const now = Date.now()
  let cleaned = 0
  for (const [agentId, session] of sessions) {
    if (now - session.lastActivity > STALE_SESSION_TTL) {
      sessions.delete(agentId)
      cleaned++
    }
  }
  if (cleaned > 0) {
    process.stderr.write(
      `[viyv-browser:mcp] Cleaned up ${cleaned} stale session(s)\n`,
    )
  }
  return cleaned
}

// Periodic stale session cleanup
const cleanupTimer = setInterval(cleanupStaleSessions, CLEANUP_INTERVAL)
cleanupTimer.unref() // Don't prevent process from exiting
