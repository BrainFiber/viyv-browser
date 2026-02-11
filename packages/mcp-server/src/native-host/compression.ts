/**
 * Compression utilities for large payloads.
 * Used when messages approach the 1MB Native Messaging limit.
 */

import { gzipSync, gunzipSync } from 'node:zlib'
import type { ChunkedMessage } from '@viyv-browser/shared'

const CHUNK_SIZE = 768 * 1024 // 768KB per chunk

// Use shared ChunkedMessage as the canonical type
export type ChunkedPayload = ChunkedMessage

export function compressPayload(data: string): { compressed: string; wasCompressed: boolean } {
  const original = Buffer.from(data, 'utf-8')
  const gzipped = gzipSync(original)

  if (gzipped.length < original.length) {
    return { compressed: gzipped.toString('base64'), wasCompressed: true }
  }
  return { compressed: data, wasCompressed: false }
}

export function decompressPayload(data: string, isCompressed: boolean): string {
  if (!isCompressed) return data
  const buf = Buffer.from(data, 'base64')
  return gunzipSync(buf).toString('utf-8')
}

export function chunkPayload(
  requestId: string,
  agentId: string,
  data: string,
  compressed: boolean,
): ChunkedPayload[] {
  const totalSize = data.length
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE)
  const chunks: ChunkedPayload[] = []

  for (let i = 0; i < totalChunks; i++) {
    chunks.push({
      type: 'chunk',
      requestId,
      agentId,
      chunkIndex: i,
      totalChunks,
      totalSize,
      compressed,
      data: data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    })
  }

  return chunks
}

// FIX #20: Guard against empty chunks array
export function reassembleChunks(chunks: ChunkedPayload[]): string {
  if (chunks.length === 0) {
    throw new Error('Cannot reassemble: no chunks provided')
  }

  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)

  if (sorted.length !== sorted[0].totalChunks) {
    throw new Error(
      `Incomplete chunks: got ${sorted.length}, expected ${sorted[0].totalChunks}`,
    )
  }

  const data = sorted.map((c) => c.data).join('')
  return decompressPayload(data, sorted[0].compressed)
}
