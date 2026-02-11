/**
 * Event bridge: forwards browser events from Extension to stdout
 * for consumption by viyv Daemon EventTriggerManager.
 */

import type { BrowserEventType, EventSubscription } from '@viyv-browser/shared'

const subscriptions = new Map<string, EventSubscription>()
const eventListeners = new Set<(event: Record<string, unknown>) => void>()

export function addEventListener(cb: (event: Record<string, unknown>) => void) {
  eventListeners.add(cb)
}

export function removeEventListener(cb: (event: Record<string, unknown>) => void) {
  eventListeners.delete(cb)
}

export function addSubscription(sub: EventSubscription): void {
  subscriptions.set(sub.id, sub)
}

export function removeSubscription(subId: string): boolean {
  return subscriptions.delete(subId)
}

// L2 FIX: Remove all subscriptions for an agent on session close
export function removeSubscriptionsByAgent(agentId: string): number {
  let removed = 0
  for (const [id, sub] of subscriptions) {
    if (sub.agentId === agentId) {
      subscriptions.delete(id)
      removed++
    }
  }
  return removed
}

export function getSubscriptions(agentId?: string): EventSubscription[] {
  const subs = Array.from(subscriptions.values())
  if (agentId) return subs.filter((s) => s.agentId === agentId)
  return subs
}

export function processEvent(event: {
  eventType: BrowserEventType
  agentId: string
  tabId: number
  url: string
  payload: Record<string, unknown>
  sequenceNumber: number
}): void {
  // Check subscriptions
  for (const sub of subscriptions.values()) {
    if (sub.agentId !== event.agentId) continue
    if (!sub.eventTypes.includes(event.eventType)) continue
    if (sub.urlPattern && !event.url.includes(sub.urlPattern)) continue

    // Forward to all listeners
    const payload = {
      type: 'browser_event',
      subscriptionId: sub.id,
      ...event,
      timestamp: Date.now(),
    }
    for (const listener of eventListeners) {
      listener(payload)
    }
  }
}
