/**
 * Tool registry: defines all MCP tools and their schemas.
 */

import { z } from 'zod'

import { GIF_CREATOR_DESCRIPTION } from './advanced/gif-creator.js'
import { RESIZE_WINDOW_DESCRIPTION } from './advanced/resize-window.js'
import { SHORTCUTS_EXECUTE_DESCRIPTION } from './advanced/shortcuts-execute.js'
import { SHORTCUTS_LIST_DESCRIPTION } from './advanced/shortcuts-list.js'
import { SWITCH_BROWSER_DESCRIPTION } from './advanced/switch-browser.js'
import { UPDATE_PLAN_DESCRIPTION } from './advanced/update-plan.js'
import { UPLOAD_IMAGE_DESCRIPTION } from './advanced/upload-image.js'
import { CLICK_DESCRIPTION } from './core/click.js'
import { DRAG_DESCRIPTION } from './core/drag.js'
import { FIND_DESCRIPTION } from './core/find.js'
import { FORM_INPUT_DESCRIPTION } from './core/form-input.js'
import { GET_PAGE_TEXT_DESCRIPTION } from './core/get-page-text.js'
import { HANDLE_DIALOG_DESCRIPTION } from './core/handle-dialog.js'
import { HOVER_DESCRIPTION } from './core/hover.js'
import { JAVASCRIPT_EXEC_DESCRIPTION } from './core/javascript-exec.js'
import { KEY_DESCRIPTION } from './core/key.js'
import { NAVIGATE_DESCRIPTION } from './core/navigate.js'
import { READ_PAGE_DESCRIPTION } from './core/read-page.js'
import { SCREENSHOT_DESCRIPTION } from './core/screenshot.js'
import { SCROLL_DESCRIPTION } from './core/scroll.js'
import { TYPE_DESCRIPTION } from './core/type.js'
import { WAIT_FOR_DESCRIPTION } from './core/wait-for.js'
import { READ_CONSOLE_MESSAGES_DESCRIPTION } from './debug/read-console-messages.js'
import { READ_NETWORK_REQUESTS_DESCRIPTION } from './debug/read-network-requests.js'
import { SELECT_TAB_DESCRIPTION } from './tabs/select-tab.js'
import { TAB_CLOSE_DESCRIPTION } from './tabs/tab-close.js'
import { TABS_CONTEXT_DESCRIPTION } from './tabs/tabs-context.js'
import { TABS_CREATE_DESCRIPTION } from './tabs/tabs-create.js'
import { AGENT_TAB_ASSIGN_DESCRIPTION } from './viyv/agent-tab-assign.js'
import { AGENT_TAB_LIST_DESCRIPTION } from './viyv/agent-tab-list.js'
import { ARTIFACT_FROM_PAGE_DESCRIPTION } from './viyv/artifact-from-page.js'
import { BROWSER_EVENT_SUBSCRIBE_DESCRIPTION } from './viyv/browser-event-subscribe.js'
import { BROWSER_EVENT_UNSUBSCRIBE_DESCRIPTION } from './viyv/browser-event-unsubscribe.js'
import { BROWSER_HEALTH_DESCRIPTION } from './viyv/browser-health.js'
import { PAGE_DATA_EXTRACT_DESCRIPTION } from './viyv/page-data-extract.js'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
}

// ── Core Browser Tools ──

export const navigateTool: ToolDefinition = {
  name: 'navigate',
  description: NAVIGATE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID to navigate'),
    url: z.string().describe('URL to navigate to, or "back"/"forward" for history'),
  }),
}

export const screenshotTool: ToolDefinition = {
  name: 'screenshot',
  description: SCREENSHOT_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID to capture'),
    format: z.enum(['jpeg', 'png']).optional().describe('Image format (default: jpeg)'),
    quality: z.number().min(1).max(100).optional().describe('JPEG quality (default: 80)'),
    region: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .optional()
      .describe('Capture region [x0, y0, x1, y1]'),
  }),
}

export const clickTool: ToolDefinition = {
  name: 'click',
  description: CLICK_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    coordinate: z
      .tuple([z.number(), z.number()])
      .optional()
      .describe('Click position [x, y]'),
    ref: z.string().optional().describe('Element reference ID'),
    action: z
      .enum(['left_click', 'right_click', 'double_click', 'triple_click'])
      .optional()
      .describe('Click type (default: left_click)'),
    modifiers: z.string().optional().describe('Modifier keys (e.g., "ctrl+shift")'),
  }),
}

export const typeTool: ToolDefinition = {
  name: 'type',
  description: TYPE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    text: z.string().describe('Text to type'),
  }),
}

export const keyTool: ToolDefinition = {
  name: 'key',
  description: KEY_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    keys: z.string().describe('Space-separated keys (e.g., "Enter", "ctrl+a")'),
    repeat: z.number().min(1).max(100).optional().describe('Repeat count'),
  }),
}

export const scrollTool: ToolDefinition = {
  name: 'scroll',
  description: SCROLL_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    coordinate: z
      .tuple([z.number(), z.number()])
      .optional()
      .describe('Scroll position [x, y] (required for directional scroll)'),
    direction: z
      .enum(['up', 'down', 'left', 'right'])
      .optional()
      .describe('Scroll direction (required for directional scroll)'),
    amount: z.number().min(1).max(10).optional().describe('Scroll amount (default: 3)'),
    ref: z.string().optional().describe('Element reference ID to scroll into view'),
  }),
}

export const hoverTool: ToolDefinition = {
  name: 'hover',
  description: HOVER_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    coordinate: z.tuple([z.number(), z.number()]).optional().describe('Hover position [x, y]'),
    ref: z.string().optional().describe('Element reference ID'),
  }),
}

export const dragTool: ToolDefinition = {
  name: 'drag',
  description: DRAG_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    startCoordinate: z.tuple([z.number(), z.number()]).describe('Start position [x, y]'),
    endCoordinate: z.tuple([z.number(), z.number()]).describe('End position [x, y]'),
  }),
}

export const readPageTool: ToolDefinition = {
  name: 'read_page',
  description: READ_PAGE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    filter: z
      .enum(['interactive', 'all'])
      .optional()
      .describe('Filter: "interactive" for buttons/links/inputs, "all" for everything'),
    depth: z.number().min(1).max(20).optional().describe('Max tree depth (default: 8)'),
    refId: z.string().optional().describe('Focus on a specific element by ref'),
    maxChars: z.number().optional().describe('Max output characters (default: 50000)'),
  }),
}

export const findTool: ToolDefinition = {
  name: 'find',
  description: FIND_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    query: z.string().describe('Natural language description of what to find'),
  }),
}

export const formInputTool: ToolDefinition = {
  name: 'form_input',
  description: FORM_INPUT_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    ref: z.string().describe('Element reference ID'),
    value: z.union([z.string(), z.boolean(), z.number()]).describe('Value to set'),
  }),
}

export const javascriptExecTool: ToolDefinition = {
  name: 'javascript_exec',
  description: JAVASCRIPT_EXEC_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    code: z.string().describe('JavaScript code to execute'),
  }),
}

export const waitForTool: ToolDefinition = {
  name: 'wait_for',
  description: WAIT_FOR_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    selector: z.string().optional().describe('CSS selector to wait for'),
    navigation: z.boolean().optional().describe('Wait for navigation to complete'),
    timeout: z.number().optional().describe('Timeout in ms (default: 30000)'),
  }),
}

export const getPageTextTool: ToolDefinition = {
  name: 'get_page_text',
  description: GET_PAGE_TEXT_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
  }),
}

export const handleDialogTool: ToolDefinition = {
  name: 'handle_dialog',
  description: HANDLE_DIALOG_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    action: z.enum(['accept', 'dismiss']).describe('Dialog action'),
    text: z.string().optional().describe('Text for prompt dialog'),
  }),
}

// ── Tab Management Tools ──

export const tabsContextTool: ToolDefinition = {
  name: 'tabs_context',
  description: TABS_CONTEXT_DESCRIPTION,
  inputSchema: z.object({
    createIfEmpty: z
      .boolean()
      .optional()
      .describe('Create a new tab group if none exists'),
  }),
}

export const tabsCreateTool: ToolDefinition = {
  name: 'tabs_create',
  description: TABS_CREATE_DESCRIPTION,
  inputSchema: z.object({
    url: z.string().optional().describe('URL to open in the new tab'),
  }),
}

export const tabCloseTool: ToolDefinition = {
  name: 'tab_close',
  description: TAB_CLOSE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID to close'),
  }),
}

export const selectTabTool: ToolDefinition = {
  name: 'select_tab',
  description: SELECT_TAB_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID to focus'),
  }),
}

// ── Debug Tools ──

export const readConsoleMessagesTool: ToolDefinition = {
  name: 'read_console_messages',
  description: READ_CONSOLE_MESSAGES_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    pattern: z.string().optional().describe('Regex pattern to filter messages'),
    onlyErrors: z.boolean().optional().describe('Only return errors'),
    limit: z.number().optional().describe('Max messages to return (default: 100)'),
    clear: z.boolean().optional().describe('Clear messages after reading'),
  }),
}

export const readNetworkRequestsTool: ToolDefinition = {
  name: 'read_network_requests',
  description: READ_NETWORK_REQUESTS_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    urlPattern: z.string().optional().describe('URL pattern to filter requests'),
    limit: z.number().optional().describe('Max requests to return (default: 100)'),
    clear: z.boolean().optional().describe('Clear requests after reading'),
  }),
}

// ── Advanced Tools ──

export const gifCreatorTool: ToolDefinition = {
  name: 'gif_creator',
  description: GIF_CREATOR_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    action: z
      .enum(['start_recording', 'stop_recording', 'export', 'clear'])
      .describe('GIF action'),
    filename: z.string().optional().describe('Filename for export'),
    options: z
      .object({
        showClickIndicators: z.boolean().optional(),
        showDragPaths: z.boolean().optional(),
        showActionLabels: z.boolean().optional(),
        showProgressBar: z.boolean().optional(),
        showWatermark: z.boolean().optional(),
        quality: z.number().min(1).max(30).optional(),
      })
      .optional()
      .describe('GIF rendering options'),
    download: z.boolean().optional().describe('Download the GIF'),
  }),
}

export const uploadImageTool: ToolDefinition = {
  name: 'upload_image',
  description: UPLOAD_IMAGE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    imageId: z.string().describe('Image ID from a previous screenshot'),
    ref: z.string().optional().describe('Element reference for file input'),
    coordinate: z
      .tuple([z.number(), z.number()])
      .optional()
      .describe('Coordinates for drag & drop'),
  }),
}

export const updatePlanTool: ToolDefinition = {
  name: 'update_plan',
  description: UPDATE_PLAN_DESCRIPTION,
  inputSchema: z.object({
    domains: z.array(z.string()).describe('Domains to visit'),
    approach: z.array(z.string()).describe('Steps in the plan'),
  }),
}

export const resizeWindowTool: ToolDefinition = {
  name: 'resize_window',
  description: RESIZE_WINDOW_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    width: z.number().describe('Window width in pixels'),
    height: z.number().describe('Window height in pixels'),
  }),
}

export const shortcutsListTool: ToolDefinition = {
  name: 'shortcuts_list',
  description: SHORTCUTS_LIST_DESCRIPTION,
  inputSchema: z.object({
    tabId: z
      .number()
      .optional()
      .describe('Tab ID (used to identify the tab group context)'),
  }),
}

export const shortcutsExecuteTool: ToolDefinition = {
  name: 'shortcuts_execute',
  description: SHORTCUTS_EXECUTE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID to execute the shortcut on'),
    command: z.string().optional().describe('Command name of the shortcut'),
    shortcutId: z.string().optional().describe('ID of the shortcut'),
  }),
}

export const switchBrowserTool: ToolDefinition = {
  name: 'switch_browser',
  description: SWITCH_BROWSER_DESCRIPTION,
  inputSchema: z.object({}),
}

// ── viyv Integration Tools ──

export const agentTabAssignTool: ToolDefinition = {
  name: 'agent_tab_assign',
  description: AGENT_TAB_ASSIGN_DESCRIPTION,
  inputSchema: z.object({
    agentId: z.string().describe('Agent ID'),
    agentName: z.string().describe('Display name'),
    color: z.string().optional().describe('Tab group color'),
  }),
}

export const agentTabListTool: ToolDefinition = {
  name: 'agent_tab_list',
  description: AGENT_TAB_LIST_DESCRIPTION,
  inputSchema: z.object({}),
}

export const browserEventSubscribeTool: ToolDefinition = {
  name: 'browser_event_subscribe',
  description: BROWSER_EVENT_SUBSCRIBE_DESCRIPTION,
  inputSchema: z.object({
    eventTypes: z.array(z.string()).describe('Event types to subscribe to'),
    urlPattern: z.string().optional().describe('URL pattern filter'),
    conditions: z.record(z.unknown()).optional().describe('Additional conditions'),
  }),
}

export const browserEventUnsubscribeTool: ToolDefinition = {
  name: 'browser_event_unsubscribe',
  description: BROWSER_EVENT_UNSUBSCRIBE_DESCRIPTION,
  inputSchema: z.object({
    subscriptionId: z.string().describe('Subscription ID'),
  }),
}

export const artifactFromPageTool: ToolDefinition = {
  name: 'artifact_from_page',
  description: ARTIFACT_FROM_PAGE_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    type: z.string().describe('Artifact type (text, html, screenshot)'),
    title: z.string().optional().describe('Artifact title'),
  }),
}

export const pageDataExtractTool: ToolDefinition = {
  name: 'page_data_extract',
  description: PAGE_DATA_EXTRACT_DESCRIPTION,
  inputSchema: z.object({
    tabId: z.number().describe('Tab ID'),
    schema: z.record(z.unknown()).describe('Data extraction schema'),
    selector: z.string().optional().describe('CSS selector to scope extraction'),
  }),
}

export const browserHealthTool: ToolDefinition = {
  name: 'browser_health',
  description: BROWSER_HEALTH_DESCRIPTION,
  inputSchema: z.object({}),
}

// ── All Tools ──

export const allTools: ToolDefinition[] = [
  // Core (15)
  navigateTool,
  screenshotTool,
  clickTool,
  typeTool,
  keyTool,
  scrollTool,
  hoverTool,
  dragTool,
  readPageTool,
  findTool,
  formInputTool,
  javascriptExecTool,
  waitForTool,
  getPageTextTool,
  handleDialogTool,
  // Tabs (4)
  tabsContextTool,
  tabsCreateTool,
  tabCloseTool,
  selectTabTool,
  // Debug (2)
  readConsoleMessagesTool,
  readNetworkRequestsTool,
  // Advanced (7)
  gifCreatorTool,
  uploadImageTool,
  updatePlanTool,
  resizeWindowTool,
  shortcutsListTool,
  shortcutsExecuteTool,
  switchBrowserTool,
  // viyv Integration (7)
  agentTabAssignTool,
  agentTabListTool,
  browserEventSubscribeTool,
  browserEventUnsubscribeTool,
  artifactFromPageTool,
  pageDataExtractTool,
  browserHealthTool,
]
