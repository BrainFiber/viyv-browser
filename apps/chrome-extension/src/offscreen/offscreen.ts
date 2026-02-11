/**
 * Offscreen document for GIF encoding.
 * Uses Web Workers for encoding to avoid blocking.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'viyv-gif-encode') {
    // GIF encoding will be implemented in Phase 5
    sendResponse({ status: 'not_implemented' })
    return true
  }
})

console.log('[viyv-browser:Offscreen] Ready')
