export const READ_PAGE_DESCRIPTION = `Get accessibility tree representation of page elements.

Supports:
- filter: "interactive" for buttons/links/inputs only, "all" for everything
- depth: max tree depth (1-20, default 8)
- refId: focus on a specific element subtree
- maxChars: limit output size (default 50000)

Returns elements with ref IDs that can be used with click, form_input, etc.`
