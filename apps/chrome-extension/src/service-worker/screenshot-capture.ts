import { sendCdpCommand } from './cdp-controller'

interface CaptureResult {
  data: string
}

export async function captureScreenshot(
  tabId: number,
  options?: {
    format?: 'jpeg' | 'png'
    quality?: number
    region?: { x: number; y: number; width: number; height: number }
  },
): Promise<string> {
  const format = options?.format ?? 'jpeg'
  const quality = format === 'jpeg' ? (options?.quality ?? 80) : undefined

  const params: Record<string, unknown> = { format }
  if (quality !== undefined) params.quality = quality
  if (options?.region) {
    params.clip = {
      x: options.region.x,
      y: options.region.y,
      width: options.region.width,
      height: options.region.height,
      scale: 1,
    }
  }

  const result = await sendCdpCommand<CaptureResult>(tabId, 'Page.captureScreenshot', params)
  return result.data
}
