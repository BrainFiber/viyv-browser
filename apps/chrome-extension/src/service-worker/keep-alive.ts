const ALARM_NAME = 'viyv-browser-keepalive'

let keepAliveInterval: ReturnType<typeof setInterval> | null = null

export function startKeepAlive() {
  // Use chrome.alarms if available
  if (chrome.alarms) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 })
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        chrome.storage.session.set({ keepAlive: Date.now() }).catch(() => {})
      }
    })
  }

  keepAliveInterval = setInterval(() => {
    chrome.storage.session.set({ keepAlive: Date.now() }).catch(() => {})
  }, 25_000)
}

export function stopKeepAlive() {
  if (chrome.alarms) {
    chrome.alarms.clear(ALARM_NAME)
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
}
