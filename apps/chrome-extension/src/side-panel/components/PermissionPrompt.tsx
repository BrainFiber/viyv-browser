import React from 'react'

interface PermissionRequest {
  id: string
  tool: string
  description: string
}

export function PermissionPrompt({
  request,
  onApprove,
  onDeny,
}: {
  request: PermissionRequest
  onApprove: () => void
  onDeny: () => void
}) {
  return (
    <div
      style={{
        padding: 12,
        background: '#FFF3E0',
        borderRadius: 8,
        border: '1px solid #FFB74D',
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Permission Required</div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>{request.description}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onApprove}
          style={{
            padding: '4px 16px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Allow
        </button>
        <button
          type="button"
          onClick={onDeny}
          style={{
            padding: '4px 16px',
            background: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Deny
        </button>
      </div>
    </div>
  )
}
