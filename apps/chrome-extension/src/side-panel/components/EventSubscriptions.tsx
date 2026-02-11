import React from 'react'

interface Subscription {
  id: string
  eventTypes: string[]
  urlPattern?: string
}

export function EventSubscriptions({ subscriptions }: { subscriptions: Subscription[] }) {
  if (subscriptions.length === 0) {
    return <p style={{ color: '#888', fontSize: 13 }}>No event subscriptions</p>
  }

  return (
    <div>
      {subscriptions.map((sub) => (
        <div
          key={sub.id}
          style={{
            padding: 8,
            marginBottom: 4,
            background: '#f0f4f8',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          <div>{sub.eventTypes.join(', ')}</div>
          {sub.urlPattern && (
            <div style={{ color: '#666', marginTop: 2 }}>URL: {sub.urlPattern}</div>
          )}
        </div>
      ))}
    </div>
  )
}
