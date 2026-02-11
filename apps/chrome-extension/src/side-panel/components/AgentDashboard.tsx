import React from 'react'

interface AgentInfo {
  agentId: string
  agentName: string
  color: string
  tabs: number[]
}

export function AgentDashboard({ agents }: { agents: AgentInfo[] }) {
  if (agents.length === 0) {
    return <p style={{ color: '#888', fontSize: 13 }}>No active agents</p>
  }

  return (
    <div>
      {agents.map((agent) => (
        <div
          key={agent.agentId}
          style={{
            padding: 8,
            marginBottom: 8,
            borderLeft: `3px solid ${agent.color}`,
            background: '#f8f8f8',
            borderRadius: 4,
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 14 }}>{agent.agentName}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {agent.tabs.length} tab{agent.tabs.length !== 1 ? 's' : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
