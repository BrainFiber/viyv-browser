import React from 'react'
import { createRoot } from 'react-dom/client'

// FIX #15: Add ErrorBoundary to catch rendering errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[viyv-browser:side-panel] React error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', color: '#dc3545' }}>
          <h3>Something went wrong</h3>
          <p>{this.state.error?.message}</p>
          <button type="button" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface ShortcutInfo {
  id: string
  command: string
  description: string
  isWorkflow: boolean
}

function App() {
  const [activeShortcut, setActiveShortcut] = React.useState<ShortcutInfo | null>(null)

  React.useEffect(() => {
    const listener = (message: Record<string, unknown>) => {
      if (message.type === 'viyv-shortcut-execute' && message.shortcut) {
        setActiveShortcut(message.shortcut as ShortcutInfo)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2>Viyv Browser</h2>
      {activeShortcut ? (
        <div
          style={{
            padding: 12,
            background: '#f0f7ff',
            borderRadius: 8,
            border: '1px solid #cce0ff',
          }}
        >
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
            Running shortcut: {activeShortcut.command}
          </p>
          <p style={{ margin: 0, color: '#666', fontSize: 14 }}>{activeShortcut.description}</p>
        </div>
      ) : (
        <p>Agent dashboard coming soon.</p>
      )}
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
