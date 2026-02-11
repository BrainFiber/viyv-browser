/**
 * Form handler: sets values in form elements by ref.
 * Used by the `form_input` tool.
 */

const REF_PATTERN = /^(find_|page_)?ref_\d+$/

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'viyv-form-input') return false

  const { ref, value } = message
  if (!REF_PATTERN.test(ref)) {
    sendResponse({ error: 'Invalid ref ID format' })
    return true
  }
  const result = setFormValue(ref, value)
  sendResponse(result)
  return true
})

function setFormValue(ref: string, value: unknown) {
  const el = document.querySelector(`[data-viyv-ref="${ref}"]`) as HTMLElement
  if (!el) return { error: `Element with ref ${ref} not found` }

  const tag = el.tagName.toLowerCase()

  if (tag === 'input') {
    const input = el as HTMLInputElement
    const type = input.type.toLowerCase()

    if (type === 'checkbox' || type === 'radio') {
      input.checked = Boolean(value)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    } else if (type === 'file') {
      return { error: 'File inputs cannot be set programmatically' }
    } else {
      input.value = String(value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  } else if (tag === 'select') {
    const select = el as HTMLSelectElement
    select.value = String(value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (tag === 'textarea') {
    const textarea = el as HTMLTextAreaElement
    textarea.value = String(value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (el.contentEditable === 'true') {
    el.textContent = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    return { error: `Element ${tag} is not a form element` }
  }

  return { set: true, ref, tag }
}
