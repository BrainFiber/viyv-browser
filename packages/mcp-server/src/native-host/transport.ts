/**
 * Native Messaging transport: length-prefixed JSON over stdin/stdout.
 * Chrome Native Messaging uses 4-byte little-endian length prefix + UTF-8 JSON.
 */

const MAX_MESSAGE_SIZE = 1024 * 1024 // 1MB Chrome limit

export function encodeMessage(message: unknown): Buffer {
  const json = JSON.stringify(message)
  const body = Buffer.from(json, 'utf-8')

  if (body.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${body.length} bytes (max ${MAX_MESSAGE_SIZE})`)
  }

  const header = Buffer.alloc(4)
  header.writeUInt32LE(body.length, 0)
  return Buffer.concat([header, body])
}

export function createMessageReader(
  stream: NodeJS.ReadableStream,
  onMessage: (message: unknown) => void,
  onError?: (error: Error) => void,
  onClose?: () => void,
) {
  let buffer = Buffer.alloc(0)
  let expectedLength: number | null = null

  stream.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])

    while (true) {
      // Read length header
      if (expectedLength === null) {
        if (buffer.length < 4) break
        expectedLength = buffer.readUInt32LE(0)
        buffer = buffer.subarray(4)

        if (expectedLength > MAX_MESSAGE_SIZE) {
          onError?.(new Error(`Message too large: ${expectedLength} bytes`))
          expectedLength = null
          buffer = Buffer.alloc(0)
          break
        }
      }

      // Read message body
      if (buffer.length < expectedLength) break

      const jsonBuffer = buffer.subarray(0, expectedLength)
      buffer = buffer.subarray(expectedLength)
      expectedLength = null

      try {
        const message = JSON.parse(jsonBuffer.toString('utf-8'))
        onMessage(message)
      } catch (error) {
        onError?.(new Error(`Invalid JSON: ${(error as Error).message}`))
      }
    }
  })

  // FIX #19: Handle stream close/error events
  stream.on('error', (error: Error) => {
    onError?.(new Error(`Stream error: ${error.message}`))
  })

  stream.on('end', () => {
    onClose?.()
  })

  stream.on('close', () => {
    onClose?.()
  })
}

export function writeMessage(stream: NodeJS.WritableStream, message: unknown): void {
  const encoded = encodeMessage(message)
  stream.write(encoded)
}
