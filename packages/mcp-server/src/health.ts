/**
 * Health check for MCP Server ↔ Extension connection.
 */

let extensionConnected = false
let lastHeartbeat: number | null = null

export function setExtensionConnected(connected: boolean) {
  extensionConnected = connected
  if (connected) lastHeartbeat = Date.now()
}

export function recordHeartbeat() {
  lastHeartbeat = Date.now()
}

const HEARTBEAT_STALENESS_MS = 60_000

export function isExtensionConnected(): boolean {
  if (!extensionConnected) return false
  // Also verify heartbeat is within staleness threshold
  if (lastHeartbeat !== null && Date.now() - lastHeartbeat > HEARTBEAT_STALENESS_MS) {
    return false
  }
  return true
}

export function getHealthStatus() {
  return {
    extensionConnected,
    lastHeartbeat,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().heapUsed,
  }
}
