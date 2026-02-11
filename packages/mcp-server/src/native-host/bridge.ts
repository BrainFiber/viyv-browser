/**
 * Bridge between Native Messaging Host and MCP Server via Unix socket.
 *
 * When running as --native-host:
 *   Chrome <-> stdin/stdout (Native Messaging) <-> this bridge <-> Unix socket <-> MCP Server
 */

import { createConnection, type Socket } from 'node:net'
import { createMessageReader, writeMessage } from './transport.js'
import { compressPayload, decompressPayload } from './compression.js'
import { RECONNECT, LIMITS } from '@viyv-browser/shared'

const MAX_BUFFER_SIZE = 1000

export interface BridgeOptions {
  socketPath: string
  onError?: (error: Error) => void
}

export function startBridge(options: BridgeOptions): void {
  const { socketPath, onError } = options
  let socket: Socket | null = null
  let reconnecting = false
  let retryCount = 0

  // FIX #2: Actual message buffer for messages received while socket is disconnected
  const pendingMessages: unknown[] = []

  function flushBuffer() {
    if (!socket || socket.destroyed) return
    while (pendingMessages.length > 0) {
      const msg = pendingMessages[0] // FIX NL3: Peek first, don't shift until write succeeds
      try {
        const written = socket.write(`${JSON.stringify(msg)}\n`)
        pendingMessages.shift() // Safe to remove after successful write call
        if (!written) {
          // Backpressure: wait for drain before continuing flush
          socket.once('drain', () => flushBuffer())
          return
        }
      } catch (error) {
        // Message stays in buffer for retry on reconnection
        onError?.(error as Error)
        return
      }
    }
  }

  function connectSocket() {
    socket = createConnection(socketPath)

    socket.on('connect', () => {
      process.stderr.write(
        `[viyv-browser:native-host] Connected to MCP server at ${socketPath}\n`,
      )
      retryCount = 0 // Reset backoff on successful connection
      flushBuffer()
    })

    // Messages from MCP Server -> Chrome (via stdout)
    // TCP stream fragmentation fix: line-based buffer
    let lineBuffer = ''

    socket.on('data', (data) => {
      lineBuffer += data.toString('utf-8')
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? '' // Keep incomplete last line
      for (const line of lines) {
        if (!line) continue
        try {
          let message = JSON.parse(line)
          // NM5: Decompress incoming compressed messages from MCP Server
          if (message.type === 'compressed' && typeof message.data === 'string') {
            const decompressed = decompressPayload(message.data, true)
            message = JSON.parse(decompressed)
          }
          writeMessage(process.stdout, message)
        } catch (error) {
          onError?.(error as Error)
        }
      }
    })

    socket.on('error', (error) => {
      process.stderr.write(
        `[viyv-browser:native-host] Socket error: ${error.message}\n`,
      )
      onError?.(error)
    })

    socket.on('close', () => {
      process.stderr.write('[viyv-browser:native-host] Socket closed\n')
      socket = null
      if (!reconnecting) {
        reconnecting = true
        // Exponential backoff: 1s, 2s, 4s, ..., max 30s
        const delay = Math.min(
          RECONNECT.INITIAL_DELAY * Math.pow(RECONNECT.MULTIPLIER, retryCount),
          RECONNECT.MAX_DELAY,
        )
        retryCount++
        process.stderr.write(
          `[viyv-browser:native-host] Reconnecting in ${delay}ms (attempt ${retryCount})\n`,
        )
        setTimeout(() => {
          reconnecting = false
          connectSocket()
        }, delay)
      }
    })
  }

  // Messages from Chrome (via stdin) -> MCP Server
  createMessageReader(
    process.stdin,
    (message) => {
      if (socket && !socket.destroyed) {
        // NM5: Compress large payloads (e.g., screenshots) before Unix socket transfer
        const json = JSON.stringify(message)
        if (json.length > LIMITS.CHUNK_SIZE) {
          const { compressed, wasCompressed } = compressPayload(json)
          if (wasCompressed) {
            socket.write(`${JSON.stringify({ type: 'compressed', data: compressed })}\n`)
          } else {
            socket.write(`${json}\n`)
          }
        } else {
          socket.write(`${json}\n`)
        }
      } else {
        // Buffer messages while disconnected
        if (pendingMessages.length < MAX_BUFFER_SIZE) {
          pendingMessages.push(message)
        } else {
          process.stderr.write(
            '[viyv-browser:native-host] Message buffer full, dropping message\n',
          )
        }
      }
    },
    onError,
  )

  connectSocket()

  // Clean shutdown handlers
  process.on('SIGINT', () => {
    socket?.destroy()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    socket?.destroy()
    process.exit(0)
  })

  process.stdin.on('end', () => {
    process.stderr.write('[viyv-browser:native-host] stdin closed, shutting down\n')
    socket?.destroy()
    process.exit(0)
  })
}
