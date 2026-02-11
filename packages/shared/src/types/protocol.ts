import type { ErrorCode } from './errors.js'

/** Tool call request from MCP Server to Extension */
export interface NativeRequest {
  id: string
  type: 'tool_call'
  agentId: string
  tool: string
  input: Record<string, unknown>
  timestamp: number
}

/** Tool result from Extension to MCP Server */
export interface NativeResponse {
  id: string
  type: 'tool_result'
  agentId: string
  success: boolean
  result?: Record<string, unknown>
  error?: { code: ErrorCode; message: string }
  timestamp: number
}

/** Browser event notification (Extension → MCP Server, async) */
export interface NativeEvent {
  id: string
  type: 'browser_event'
  agentId: string
  eventType: BrowserEventType
  payload: Record<string, unknown>
  tabId: number
  url: string
  timestamp: number
  sequenceNumber: number
}

/** Session management messages */
export interface SessionMessage {
  id: string
  type: 'session_init' | 'session_close' | 'session_heartbeat' | 'session_recovery'
  agentId: string
  protocolVersion?: string
  config?: {
    tabGroupId?: number
    agentName?: string
    agentColor?: string
  }
  timestamp: number
}

/** Chunked message for payloads exceeding 1MB limit */
export interface ChunkedMessage {
  type: 'chunk'
  requestId: string
  agentId: string
  chunkIndex: number
  totalChunks: number
  totalSize: number
  compressed: boolean
  data: string
}

export type NativeMessage = NativeRequest | NativeResponse | NativeEvent | SessionMessage | ChunkedMessage

export type BrowserEventType =
  | 'browser.page_load'
  | 'browser.page_navigate'
  | 'browser.dom_mutation'
  | 'browser.network_request'
  | 'browser.network_response'
  | 'browser.tab_created'
  | 'browser.tab_closed'
  | 'browser.tab_updated'
  | 'browser.console_error'
  | 'browser.form_submitted'
