/** Click action types */
export type ClickAction = 'left_click' | 'right_click' | 'double_click' | 'triple_click'

/** Scroll directions */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right'

/** Screenshot format */
export type ScreenshotFormat = 'jpeg' | 'png'

/** GIF creator actions */
export type GifAction = 'start_recording' | 'stop_recording' | 'export' | 'clear'

/** Dialog actions */
export type DialogAction = 'accept' | 'dismiss'

/** Page filter */
export type PageFilter = 'interactive' | 'all'

// ── Core Tool Inputs ──

export interface NavigateInput {
  tabId: number
  url: string
}

export interface ScreenshotInput {
  tabId: number
  format?: ScreenshotFormat
  quality?: number
  region?: [number, number, number, number]
}

export interface ClickInput {
  tabId: number
  coordinate?: [number, number]
  ref?: string
  action?: ClickAction
  modifiers?: string
}

export interface TypeInput {
  tabId: number
  text: string
}

export interface KeyInput {
  tabId: number
  keys: string
  repeat?: number
}

export interface ScrollInput {
  tabId: number
  coordinate: [number, number]
  direction: ScrollDirection
  amount?: number
}

export interface HoverInput {
  tabId: number
  coordinate?: [number, number]
  ref?: string
}

export interface DragInput {
  tabId: number
  startCoordinate: [number, number]
  endCoordinate: [number, number]
}

export interface ReadPageInput {
  tabId: number
  filter?: PageFilter
  depth?: number
  refId?: string
  maxChars?: number
}

export interface FindInput {
  tabId: number
  query: string
}

export interface FormInputInput {
  tabId: number
  ref: string
  value: string | boolean | number
}

export interface JavaScriptExecInput {
  tabId: number
  code: string
}

export interface WaitForInput {
  tabId: number
  selector?: string
  navigation?: boolean
  timeout?: number
}

export interface GetPageTextInput {
  tabId: number
}

export interface HandleDialogInput {
  tabId: number
  action: DialogAction
  text?: string
}

// ── Tab Tool Inputs ──

export interface TabsContextInput {
  createIfEmpty?: boolean
}

export interface TabsCreateInput {
  url?: string
}

export interface TabCloseInput {
  tabId: number
}

export interface SelectTabInput {
  tabId: number
}

// ── Debug Tool Inputs ──

export interface ReadConsoleMessagesInput {
  tabId: number
  pattern?: string
  onlyErrors?: boolean
  limit?: number
  clear?: boolean
}

export interface ReadNetworkRequestsInput {
  tabId: number
  urlPattern?: string
  limit?: number
  clear?: boolean
}

// ── Advanced Tool Inputs ──

export interface GifCreatorInput {
  tabId: number
  action: GifAction
  filename?: string
  options?: {
    showClickIndicators?: boolean
    showDragPaths?: boolean
    showActionLabels?: boolean
    showProgressBar?: boolean
    showWatermark?: boolean
    quality?: number
  }
  download?: boolean
}

export interface UploadImageInput {
  tabId: number
  imageId: string
  ref?: string
  coordinate?: [number, number]
}

export interface UpdatePlanInput {
  domains: string[]
  approach: string[]
}

export interface ResizeWindowInput {
  tabId: number
  width: number
  height: number
}

// ── viyv Integration Tool Inputs ──

export interface AgentTabAssignInput {
  agentId: string
  agentName: string
  color?: string
}

export interface BrowserEventSubscribeInput {
  eventTypes: string[]
  urlPattern?: string
  conditions?: Record<string, unknown>
}

export interface BrowserEventUnsubscribeInput {
  subscriptionId: string
}

export interface ArtifactFromPageInput {
  tabId: number
  type: string
  title?: string
}

export interface PageDataExtractInput {
  tabId: number
  schema: Record<string, unknown>
  selector?: string
}
