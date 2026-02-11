/**
 * Accessibility tree builder for viyv-browser.
 * Injected at document_start on all pages.
 * Builds a lightweight a11y tree with WeakRef element references.
 */

const REF_PATTERN = /^(find_|page_)?ref_\d+$/

let refCounter = 0

function assignRef(el: Element): string {
  const existing = (el as HTMLElement).dataset?.viyvRef
  if (existing) return existing

  const ref = `ref_${refCounter++}`
  ;(el as HTMLElement).dataset.viyvRef = ref
  return ref
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'viyv-build-a11y-tree') {
    if (message.options?.refId && !REF_PATTERN.test(message.options.refId)) {
      sendResponse({ error: 'Invalid ref ID format' })
      return true
    }
    const tree = buildAccessibilityTree(message.options)
    sendResponse(tree)
    return true
  }

  if (message.type === 'viyv-find-elements') {
    const results = findElements(message.query)
    sendResponse(results)
    return true
  }
})

function buildAccessibilityTree(options?: {
  depth?: number
  maxChars?: number
  refId?: string
  filter?: string
}) {
  const maxDepth = options?.depth ?? 8
  const maxChars = options?.maxChars ?? 50_000
  const filter = options?.filter ?? 'all'

  let root: Element | null = null
  if (options?.refId) {
    root = document.querySelector(`[data-viyv-ref="${options.refId}"]`)
    if (!root) return { error: `Element with ref ${options.refId} not found` }
  } else {
    root = document.body
  }

  let output = ''
  let elementCount = 0
  const maxElements = 5000

  function walk(el: Element, depth: number) {
    if (depth > maxDepth || elementCount >= maxElements || output.length >= maxChars) return

    const tag = el.tagName.toLowerCase()
    const isInteractive =
      ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'].includes(tag) ||
      el.hasAttribute('onclick') ||
      el.hasAttribute('tabindex') ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('role') === 'link' ||
      el.getAttribute('role') === 'textbox'

    if (filter === 'interactive' && !isInteractive && el.children.length === 0) return

    elementCount++
    const ref = assignRef(el)
    const role = el.getAttribute('role') || tag
    const indent = '  '.repeat(depth)

    let line = `${indent}[${ref}] ${role}`

    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) line += ` "${ariaLabel}"`

    if (tag === 'input') {
      const input = el as HTMLInputElement
      line += ` type=${input.type}`
      if (input.value) line += ` value="${input.value.slice(0, 50)}"`
      if (input.placeholder) line += ` placeholder="${input.placeholder.slice(0, 50)}"`
    }

    if (el.children.length === 0) {
      const text = el.textContent?.trim()
      if (text) line += `: ${text.slice(0, 100)}`
    }

    output += line + '\n'

    for (const child of el.children) {
      walk(child, depth + 1)
    }
  }

  walk(root, 0)
  return { tree: output.slice(0, maxChars), elementCount, truncated: output.length >= maxChars }
}

function findElements(query: string) {
  const results: Array<{ ref: string; tag: string; text: string; role: string }> = []
  if (!document.body) return { matches: results, total: 0 }
  const lowerQ = query.toLowerCase()
  const elements = document.querySelectorAll('*')

  for (const el of elements) {
    if (results.length >= 20) break

    const text = el.textContent?.trim() || ''
    const ariaLabel = el.getAttribute('aria-label') || ''
    const placeholder = (el as HTMLInputElement).placeholder || ''
    const title = el.getAttribute('title') || ''
    const alt = (el as HTMLImageElement).alt || ''

    const searchable = `${text} ${ariaLabel} ${placeholder} ${title} ${alt}`.toLowerCase()
    if (!searchable.includes(lowerQ)) continue

    const ref = assignRef(el)
    results.push({
      ref,
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 100),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
    })
  }

  return { matches: results, total: results.length }
}
