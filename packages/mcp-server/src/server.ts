/**
 * MCP Server for viyv-browser.
 * Communicates with viyv Daemon via stdio (JSON-RPC) or SSE (HTTP),
 * and with Chrome Extension via Unix socket <-> Native Messaging bridge.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, unlinkSync } from 'node:fs'
import http from 'node:http'
import { type Server as NetServer, type Socket, createServer } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { type BrowserEventType, MCP_SERVER, PROTOCOL_VERSION, TIMEOUTS } from '@viyv-browser/shared'
import {
  closeSession,
  createSession,
  getDefaultAgentId,
  setDefaultAgentId,
  touchSession,
} from './agent-session.js'
import {
  addEventListener,
  addSubscription,
  processEvent,
  removeEventListener,
  removeSubscription,
  removeSubscriptionsByAgent,
} from './event-bridge.js'
import { isExtensionConnected, recordHeartbeat, setExtensionConnected } from './health.js'
import { decompressPayload } from './native-host/compression.js'
import { allTools } from './tools/index.js'

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingRequests = new Map<string, PendingRequest>()
let extensionSocket: Socket | null = null

export interface McpServerOptions {
  transport?: 'stdio' | 'sse'
  port?: number
}

/**
 * Creates a fully configured McpServer with all tools registered and event forwarding.
 * Each SSE session needs its own McpServer instance (McpServer.connect() can only be called once).
 */
function createConfiguredMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER.NAME,
    version: MCP_SERVER.VERSION,
  })

  // Register all tools -- pass Zod shape directly (FIX #1: MCP SDK expects Zod, not JSON Schema)
  for (const tool of allTools) {
    const shape = tool.inputSchema._def.shape?.() ?? {}
    server.tool(tool.name, tool.description, shape, async (params) => {
      const result = await callExtensionTool(tool.name, params as Record<string, unknown>)

      // BUG-4 FIX: Sync event subscriptions with MCP server's event-bridge
      if (tool.name === 'browser_event_subscribe' && result.content[0]) {
        try {
          const parsed = JSON.parse(result.content[0].text)
          if (parsed.subscriptionId) {
            const p = params as Record<string, unknown>
            addSubscription({
              id: parsed.subscriptionId,
              agentId: getDefaultAgentId(),
              eventTypes: (p.eventTypes as BrowserEventType[]) ?? [],
              urlPattern: p.urlPattern as string | undefined,
              createdAt: Date.now(),
            })
          }
        } catch {
          /* ignore parse errors */
        }
      } else if (tool.name === 'browser_event_unsubscribe' && result.content[0]) {
        try {
          const parsed = JSON.parse(result.content[0].text)
          if (parsed.subscriptionId) {
            removeSubscription(parsed.subscriptionId)
          }
        } catch {
          /* ignore parse errors */
        }
      }

      return result
    })
  }

  // Forward browser events through MCP logging notification
  const listener = (event: Record<string, unknown>) => {
    server
      .sendLoggingMessage({
        level: 'info',
        data: event,
      })
      .catch(() => {
        // Ignore send errors for events (client may not be listening)
      })
  }
  addEventListener(listener)

  // Clean up listener when transport closes
  server.server.onclose = () => {
    removeEventListener(listener)
  }

  return server
}

export async function startMcpServer(
  socketPath: string,
  agentName?: string,
  options?: McpServerOptions,
): Promise<void> {
  if (agentName) {
    setDefaultAgentId(agentName)
  }

  // -- Unix Socket Server (for Native Host connections) -- shared by both transports
  const socketServer = createSocketServer(socketPath)

  if (options?.transport === 'sse') {
    // -- SSE mode: HTTP server, one McpServer per SSE session --
    const sessions = new Map<string, { transport: SSEServerTransport; server: McpServer }>()

    const httpServer = http.createServer()

    httpServer.on('request', (req, res) => {
      handleSseRequest(req, res, sessions).catch((error) => {
        process.stderr.write(`[viyv-browser:mcp] SSE request error: ${(error as Error).message}\n`)
        if (!res.headersSent) {
          res.writeHead(500).end('Internal server error')
        }
      })
    })

    const listenPort = options.port ?? 0
    httpServer.listen(listenPort, '127.0.0.1', () => {
      const addr = httpServer.address()
      const port = typeof addr === 'object' ? addr?.port : listenPort
      process.stdout.write(`${JSON.stringify({ port })}\n`)
      process.stderr.write(`[viyv-browser:mcp] SSE server listening on 127.0.0.1:${port}\n`)
    })

    process.stderr.write(`[viyv-browser:mcp] MCP Server started (SSE), socket: ${socketPath}\n`)

    // Graceful shutdown: close SSE sessions async, then sync cleanup
    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      for (const { server: s } of sessions.values()) {
        await s.close().catch(() => {})
      }
      httpServer.close(() => {})
      socketServer.close(() => {})
      cleanupSocket(socketPath)
      process.exit(0)
    }
    process.on('SIGINT', () => {
      shutdown()
    })
    process.on('SIGTERM', () => {
      shutdown()
    })

    // Sync fallback for unexpected exit (e.g. uncaughtException)
    // shutdown() already handled close — only clean up socket file here
    process.on('exit', () => {
      cleanupSocket(socketPath)
    })
  } else {
    // -- stdio mode (default) --
    const server = createConfiguredMcpServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)

    process.stderr.write(`[viyv-browser:mcp] MCP Server started (stdio), socket: ${socketPath}\n`)

    process.on('SIGINT', () => process.exit(0))
    process.on('SIGTERM', () => process.exit(0))

    process.on('exit', () => {
      socketServer.close()
      cleanupSocket(socketPath)
    })
  }
}

async function handleSseRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessions: Map<string, { transport: SSEServerTransport; server: McpServer }>,
): Promise<void> {
  if (req.method === 'GET' && req.url === '/sse') {
    // New SSE session
    const transport = new SSEServerTransport('/message', res)
    const mcpServer = createConfiguredMcpServer()

    transport.onclose = () => {
      sessions.delete(transport.sessionId)
    }

    // Fallback: clean up session if HTTP connection closes without transport.onclose
    res.on('close', () => {
      if (sessions.has(transport.sessionId)) {
        sessions.delete(transport.sessionId)
        transport.close()
      }
    })

    await mcpServer.connect(transport)

    // Register session only after connect succeeds
    sessions.set(transport.sessionId, { transport, server: mcpServer })
  } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
    // Route POST to the correct session
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const sessionId = url.searchParams.get('sessionId')
    const session = sessionId ? sessions.get(sessionId) : null

    if (session) {
      await session.transport.handlePostMessage(req, res)
    } else {
      res.writeHead(404).end('Session not found')
    }
  } else {
    res.writeHead(404).end()
  }
}

function createSocketServer(socketPath: string): NetServer {
  cleanupSocket(socketPath)

  const server = createServer((socket) => {
    // FIX #6: Clean up old connection before accepting new one
    if (extensionSocket && !extensionSocket.destroyed) {
      process.stderr.write('[viyv-browser:mcp] Replacing existing extension connection\n')
      extensionSocket.destroy()
    }

    process.stderr.write('[viyv-browser:mcp] Extension connected via Unix socket\n')
    extensionSocket = socket
    setExtensionConnected(true)

    // NM3: Send session_init with protocol version on connection
    const agentId = getDefaultAgentId()
    createSession(agentId)
    const initMsg = {
      id: randomUUID(),
      type: 'session_init',
      agentId,
      protocolVersion: PROTOCOL_VERSION,
      timestamp: Date.now(),
    }
    socket.write(`${JSON.stringify(initMsg)}\n`)

    // TCP stream fragmentation fix: line-based buffer
    let lineBuffer = ''

    socket.on('data', (data) => {
      lineBuffer += data.toString('utf-8')
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? '' // Keep incomplete last line
      for (const line of lines) {
        if (!line) continue
        try {
          let parsed = JSON.parse(line)
          // NM5: Handle compressed messages from Native Host
          if (parsed.type === 'compressed' && typeof parsed.data === 'string') {
            const decompressed = decompressPayload(parsed.data, true)
            parsed = JSON.parse(decompressed)
          }
          handleExtensionMessage(parsed)
        } catch (error) {
          process.stderr.write(`[viyv-browser:mcp] Parse error: ${(error as Error).message}\n`)
        }
      }
    })

    socket.on('close', () => {
      process.stderr.write('[viyv-browser:mcp] Extension disconnected\n')
      // Only clear if this is still the active socket
      if (extensionSocket === socket) {
        extensionSocket = null
        setExtensionConnected(false)
      }

      // Reject all pending requests on disconnect
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timer)
        pendingRequests.delete(id)
        pending.resolve({
          error: {
            code: 'EXTENSION_NOT_CONNECTED',
            message: 'Extension disconnected while request was pending',
          },
        })
      }
    })

    socket.on('error', (error) => {
      process.stderr.write(`[viyv-browser:mcp] Socket error: ${error.message}\n`)
    })
  })

  server.listen(socketPath, () => {
    process.stderr.write(`[viyv-browser:mcp] Unix socket listening on ${socketPath}\n`)
  })

  return server
}

// FIX #8: Validate message structure before processing
function handleExtensionMessage(message: unknown) {
  if (!message || typeof message !== 'object') return
  const msg = message as Record<string, unknown>

  const type = typeof msg.type === 'string' ? msg.type : null
  const id = typeof msg.id === 'string' ? msg.id : null
  if (!type) return

  if (type === 'tool_result' && id) {
    const pending = pendingRequests.get(id)
    if (pending) {
      clearTimeout(pending.timer)
      pendingRequests.delete(id)

      if (msg.success) {
        pending.resolve((msg.result as Record<string, unknown>) ?? {})
      } else {
        const err = msg.error as Record<string, unknown> | undefined
        const code = typeof err?.code === 'string' ? err.code : 'UNKNOWN'
        const errMsg = typeof err?.message === 'string' ? err.message : 'Unknown error'
        pending.reject(new Error(`[${code}] ${errMsg}`))
      }
    }
  } else if (type === 'session_heartbeat') {
    recordHeartbeat()
    // NM6: Touch session on heartbeat
    const hbAgentId = typeof msg.agentId === 'string' ? msg.agentId : null
    if (hbAgentId) touchSession(hbAgentId)
  } else if (type === 'session_close') {
    // NH2: Clean up session resources on close
    const closeAgentId = typeof msg.agentId === 'string' ? msg.agentId : null
    if (closeAgentId) {
      closeSession(closeAgentId)
      // L2 FIX: Clean up stale event subscriptions for this agent
      removeSubscriptionsByAgent(closeAgentId)
      process.stderr.write(`[viyv-browser:mcp] Session closed and cleaned up: ${closeAgentId}\n`)
    }
  } else if (type === 'session_recovery') {
    // NH2: Handle session recovery after SW restart
    const recoveryAgentId = typeof msg.agentId === 'string' ? msg.agentId : null
    if (recoveryAgentId) {
      createSession(recoveryAgentId)
      process.stderr.write(`[viyv-browser:mcp] Session recovered: ${recoveryAgentId}\n`)
    }
  } else if (type === 'session_init') {
    // L3 FIX: Verify Extension's protocol version (bidirectional check)
    const remoteVersion = typeof msg.protocolVersion === 'string' ? msg.protocolVersion : null
    if (remoteVersion && remoteVersion !== PROTOCOL_VERSION) {
      process.stderr.write(
        `[viyv-browser:mcp] Protocol version mismatch: local=${PROTOCOL_VERSION}, remote=${remoteVersion}\n`,
      )
    }
  } else if (type === 'browser_event') {
    process.stderr.write(`[viyv-browser:mcp] Browser event: ${String(msg.eventType)}\n`)
    processEvent({
      eventType: msg.eventType as import('@viyv-browser/shared').BrowserEventType,
      agentId: String(msg.agentId ?? ''),
      tabId: Number(msg.tabId ?? 0),
      url: String(msg.url ?? ''),
      payload: (msg.payload as Record<string, unknown>) ?? {},
      sequenceNumber: Number(msg.sequenceNumber ?? 0),
    })
  }
}

async function callExtensionTool(
  tool: string,
  input: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // switch_browser is handled server-side: disconnect and wait for reconnection
  if (tool === 'switch_browser') {
    return handleSwitchBrowser()
  }

  if (!extensionSocket || extensionSocket.destroyed || !isExtensionConnected()) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: 'EXTENSION_NOT_CONNECTED',
              message:
                'Chrome Extension is not connected. Please open Chrome and click the Viyv Browser extension icon.',
            },
          }),
        },
      ],
    }
  }

  const requestId = randomUUID()
  const agentId = getDefaultAgentId()

  // NM6: Touch session to record activity
  touchSession(agentId)

  // Capture socket reference before entering Promise to avoid null race
  const sock = extensionSocket

  // Per-tool timeout: wait_for gets the tool's timeout + 5s buffer
  let toolTimeout = TIMEOUTS.MCP_TOOL
  if (tool === 'wait_for' && typeof input.timeout === 'number') {
    toolTimeout = input.timeout + 5000
  }

  return new Promise((resolve) => {
    // M3 FIX: Define error listener before timer so removeErrorListener is callable from timeout
    const onError = () => {
      const pending = pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingRequests.delete(requestId)
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: 'EXTENSION_NOT_CONNECTED',
                  message: 'Socket write failed',
                },
              }),
            },
          ],
        })
      }
    }

    const removeErrorListener = () => {
      sock.removeListener('error', onError)
    }

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      removeErrorListener()
      resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                code: 'TIMEOUT',
                message: `Tool '${tool}' timed out after ${toolTimeout}ms`,
              },
            }),
          },
        ],
      })
    }, toolTimeout)

    pendingRequests.set(requestId, {
      resolve: (result) => {
        removeErrorListener()
        resolve({
          content: [{ type: 'text', text: JSON.stringify(result) }],
        })
      },
      reject: (error) => {
        removeErrorListener()
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: { code: 'CDP_ERROR', message: error.message },
              }),
            },
          ],
        })
      },
      timer,
    })

    // FIX #7: Handle socket write errors
    const request = {
      id: requestId,
      type: 'tool_call',
      agentId,
      tool,
      input,
      timestamp: Date.now(),
    }

    const written = sock.write(`${JSON.stringify(request)}\n`)
    if (!written) {
      // Backpressure -- wait for drain but don't block
      sock.once('drain', () => {
        // Buffer flushed, nothing to do
      })
    }

    sock.once('error', onError)
  })
}

async function handleSwitchBrowser(): Promise<{
  content: Array<{ type: string; text: string }>
}> {
  const SWITCH_TIMEOUT = 60_000

  // Close existing connection gracefully
  if (extensionSocket && !extensionSocket.destroyed) {
    process.stderr.write('[viyv-browser:mcp] switch_browser: closing current connection\n')
    extensionSocket.destroy()
    extensionSocket = null
    setExtensionConnected(false)
  }

  // Wait for a new connection
  process.stderr.write('[viyv-browser:mcp] switch_browser: waiting for new browser connection...\n')
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (extensionSocket && !extensionSocket.destroyed && isExtensionConnected()) {
        clearInterval(checkInterval)
        clearTimeout(timer)
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                switched: true,
                message: 'Successfully connected to new browser instance.',
              }),
            },
          ],
        })
      }
    }, 500)

    const timer = setTimeout(() => {
      clearInterval(checkInterval)
      resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                code: 'TIMEOUT',
                message: `No new browser connected within ${SWITCH_TIMEOUT / 1000}s. Please open Chrome and click the Viyv Browser extension icon.`,
              },
            }),
          },
        ],
      })
    }, SWITCH_TIMEOUT)
  })
}

function cleanupSocket(socketPath: string) {
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath)
    } catch {
      // Ignore -- may be cleaned up by another process
    }
  }
}
