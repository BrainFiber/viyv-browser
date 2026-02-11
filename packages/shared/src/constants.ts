/** Protocol version for compatibility checks */
export const PROTOCOL_VERSION = '1.0.0'

/** Native Messaging host name (must match manifest) */
export const NATIVE_HOST_NAME = 'com.viyv.browser'

/** Extension ID (will be assigned by CWS) */
export const EXTENSION_ID = '' // Set after CWS registration

// ── Timeouts (ms) ──

export const TIMEOUTS = {
  /** Overall MCP tool timeout */
  MCP_TOOL: 30_000,
  /** Native Messaging request timeout */
  NATIVE_MESSAGE: 15_000,
  /** CDP command timeout */
  CDP_COMMAND: 10_000,
  /** Screenshot capture timeout */
  SCREENSHOT: 5_000,
  /** Navigation timeout */
  NAVIGATION: 30_000,
  /** Chunk reassembly timeout */
  CHUNK_REASSEMBLY: 10_000,
  /** Default wait_for timeout */
  WAIT_FOR: 30_000,
  /** Heartbeat interval */
  HEARTBEAT: 30_000,
  /** CDP idle detach delay */
  CDP_IDLE_DETACH: 5_000,
  /** Tab lock TTL (deadlock prevention) */
  TAB_LOCK_TTL: 60_000,
} as const

// ── Limits ──

export const LIMITS = {
  /** Native Messaging max message size (Chrome limit) */
  NATIVE_MESSAGE_MAX_BYTES: 1024 * 1024,
  /** Chunk size for large payloads */
  CHUNK_SIZE: 768 * 1024,
  /** A11y tree max elements */
  A11Y_MAX_ELEMENTS: 5000,
  /** A11y tree default depth */
  A11Y_DEFAULT_DEPTH: 8,
  /** A11y tree default max chars */
  A11Y_DEFAULT_MAX_CHARS: 50_000,
  /** Event buffer max entries */
  EVENT_BUFFER_MAX: 1000,
  /** Event buffer max bytes */
  EVENT_BUFFER_MAX_BYTES: 10 * 1024 * 1024,
  /** Message buffer during disconnection */
  MESSAGE_BUFFER_MAX: 1000,
  /** Default screenshot JPEG quality */
  SCREENSHOT_JPEG_QUALITY: 80,
  /** Console buffer per tab */
  CONSOLE_BUFFER_MAX: 1000,
  /** Network buffer per tab */
  NETWORK_BUFFER_MAX: 1000,
} as const

// ── Reconnection ──

export const RECONNECT = {
  /** Initial delay (ms) */
  INITIAL_DELAY: 1000,
  /** Max delay (ms) */
  MAX_DELAY: 30_000,
  /** Backoff multiplier */
  MULTIPLIER: 2,
} as const

// ── Keep-alive ──

export const KEEP_ALIVE = {
  /** Alarm name for backup keep-alive */
  ALARM_NAME: 'viyv-browser-keepalive',
  /** Alarm period (minutes) - minimum for Chrome alarms */
  ALARM_PERIOD_MIN: 0.5,
} as const

// ── MCP Server ──

export const MCP_SERVER = {
  /** Server name for MCP protocol */
  NAME: 'viyv-browser',
  /** Server version */
  VERSION: '0.1.0',
  /** Unix socket path template */
  SOCKET_PATH_TEMPLATE: '/tmp/viyv-browser-{pid}.sock',
} as const
