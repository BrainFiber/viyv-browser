/**
 * @viyv/browser-mcp CLI entry point.
 *
 * Two modes:
 *   viyv-browser-mcp          → MCP Server mode (stdio transport + Unix socket)
 *   viyv-browser-mcp --native-host → Native Messaging Host mode (Chrome bridge)
 *   viyv-browser-mcp setup    → Register Native Messaging Host manifest
 */

import { existsSync, readdirSync } from 'node:fs'
import { startMcpServer } from './server.js'
import { startBridge } from './native-host/bridge.js'
import { runSetup } from './setup.js'

const args = process.argv.slice(2)

if (args.includes('setup')) {
  // Setup mode: register Native Messaging Host
  const extensionIdIdx = args.indexOf('--extension-id')
  const extensionId = extensionIdIdx >= 0 ? args[extensionIdIdx + 1] : undefined
  runSetup({ extensionId })
} else if (args.includes('--native-host')) {
  // Native Messaging Host mode: bridge Chrome ↔ MCP Server
  // Socket may not exist yet (MCP Server starts when AI client connects).
  // Wait and retry until the socket appears.
  const SOCKET_PATH = '/tmp/viyv-browser.sock'
  const POLL_INTERVAL = 2000
  const MAX_WAIT = 120_000

  function waitForSocket() {
    const start = Date.now()

    function poll() {
      const socketPath = findSocketPath()
      if (socketPath) {
        process.stderr.write(
          `[viyv-browser:native-host] Found socket at ${socketPath}\n`,
        )
        startBridge({
          socketPath,
          onError: (error) => {
            process.stderr.write(`[viyv-browser:native-host] Error: ${error.message}\n`)
          },
        })
        return
      }

      if (Date.now() - start > MAX_WAIT) {
        process.stderr.write(
          `[viyv-browser:native-host] MCP server socket not found after ${MAX_WAIT / 1000}s. Exiting.\n`,
        )
        process.exit(1)
      }

      process.stderr.write(
        `[viyv-browser:native-host] Waiting for MCP server socket (${SOCKET_PATH})...\n`,
      )
      setTimeout(poll, POLL_INTERVAL)
    }

    poll()
  }

  waitForSocket()
} else {
  // MCP Server mode (default) — fixed path so bridge can always find it on reconnect
  const socketPath = '/tmp/viyv-browser.sock'
  const agentNameIdx = args.indexOf('--agent-name')
  const agentName = agentNameIdx >= 0 ? args[agentNameIdx + 1] : undefined
  startMcpServer(socketPath, agentName)
}

function findSocketPath(): string | null {
  const envSocket = process.env.VIYV_BROWSER_SOCKET
  if (envSocket) return envSocket

  // Check fixed socket path first
  const fixedPath = '/tmp/viyv-browser.sock'
  if (existsSync(fixedPath)) return fixedPath

  // Fallback: scan for legacy PID-based sockets
  try {
    const tmpFiles = readdirSync('/tmp')
    const socketFile = tmpFiles.find((f) => f.startsWith('viyv-browser-') && f.endsWith('.sock'))
    if (socketFile) return `/tmp/${socketFile}`
  } catch {
    // Ignore
  }

  return null
}
