import React from 'react'

interface Activity {
  id: string
  tool: string
  timestamp: number
  status: 'pending' | 'success' | 'error'
}

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p style={{ color: '#888', fontSize: 13 }}>No recent activity</p>
  }

  return (
    <div style={{ maxHeight: 300, overflow: 'auto' }}>
      {activities.map((activity) => (
        <div
          key={activity.id}
          style={{
            padding: '4px 0',
            borderBottom: '1px solid #eee',
            fontSize: 12,
          }}
        >
          <span style={{ fontFamily: 'monospace' }}>{activity.tool}</span>
          <span style={{ float: 'right', color: '#888' }}>
            {new Date(activity.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  )
}
