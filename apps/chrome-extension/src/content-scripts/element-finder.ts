/**
 * Element finder: locates elements by natural language queries.
 * Used by the `find` tool.
 */

const REF_PATTERN = /^(find_|page_)?ref_\d+$/

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'viyv-find-elements') return false

  const query = message.query as string
  const results = findByQuery(query)
  sendResponse(results)
  return true
})

function findByQuery(query: string) {
  const matches: Array<{
    ref: string
    tag: string
    text: string
    role: string
    rect: { x: number; y: number; width: number; height: number }
  }> = []
  const lowerQ = query.toLowerCase()
  let refCounter = 0

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const el = node as Element
        if (getComputedStyle(el).display === 'none') return NodeFilter.FILTER_REJECT
        if (getComputedStyle(el).visibility === 'hidden') return NodeFilter.FILTER_SKIP
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )

  let node: Node | null
  while ((node = walker.nextNode()) && matches.length < 20) {
    const el = node as HTMLElement
    const text = el.textContent?.trim() || ''
    const ariaLabel = el.getAttribute('aria-label') || ''
    const placeholder = (el as HTMLInputElement).placeholder || ''
    const title = el.getAttribute('title') || ''
    const alt = (el as HTMLImageElement).alt || ''

    const searchable = [text, ariaLabel, placeholder, title, alt]
      .join(' ')
      .toLowerCase()

    if (!searchable.includes(lowerQ)) continue

    const ref = `ref_${refCounter++}`
    el.dataset.viyvRef = ref

    const rect = el.getBoundingClientRect()
    matches.push({
      ref,
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 100),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    })
  }

  return { matches, total: matches.length }
}
