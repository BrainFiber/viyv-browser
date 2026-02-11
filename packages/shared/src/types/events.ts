import type { BrowserEventType } from './protocol.js'

export interface EventConditions {
  /** CSS selector for DOM mutation events */
  selector?: string
  /** HTTP method filter for network events */
  method?: string
  /** Status code filter for network response events */
  statusCode?: number
  /** URL pattern for network events */
  urlMatch?: string
}

export interface BrowserEventPayload {
  eventType: BrowserEventType
  tabId: number
  url: string
  timestamp: number
  data: Record<string, unknown>
}
