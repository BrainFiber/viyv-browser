# viyv-browser

Chrome Extension + MCP Server for AI agent browser automation.

Enables AI agents to operate in the user's **real browser** with authentic login sessions — no headless browsers, no credential sharing.

## How It Works

```
AI Agent (Claude, Cursor, etc.)
  ↓  MCP Protocol (stdio)
MCP Server (viyv-browser-mcp)
  ↓  Unix Socket
Native Messaging Bridge
  ↓  Chrome Native Messaging
Chrome Extension (Service Worker)
  ↓  Chrome DevTools Protocol
Your Browser
```

The AI agent sends commands (click, type, screenshot, etc.) through MCP. The MCP server relays them to the Chrome extension via Native Messaging. The extension executes actions in your real browser tabs using CDP, preserving all your cookies, sessions, and login states.

## Quick Start

### 1. Install the MCP Server

```bash
npm install -g viyv-browser-mcp
```

### 2. Register the Native Messaging Host

```bash
viyv-browser-mcp setup
```

This registers a Native Messaging manifest so Chrome can communicate with the MCP server.

### 3. Install the Chrome Extension

1. Clone and build the project:
   ```bash
   git clone https://github.com/BrainFiber/viyv-browser.git
   cd viyv-browser
   pnpm install && pnpm build
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select `apps/chrome-extension/build/`

### 4. Connect to Your AI Agent

Add to your AI client's MCP configuration:

```json
{
  "mcpServers": {
    "viyv-browser": {
      "command": "npx",
      "args": ["viyv-browser-mcp"]
    }
  }
}
```

**Configuration file locations by client:**

| Client | Config File |
|---|---|
| Claude Code | `~/.claude/settings.json` or `claude mcp add` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` |

## MCP Tools

35+ browser automation tools organized by category.

### Core Browser

| Tool | Description |
|---|---|
| `navigate` | Go to URL, or browser history back/forward |
| `screenshot` | Capture tab as JPEG (default) or PNG, optional region crop |
| `click` | Click at coordinates or by element ref. Supports left/right/double/triple-click with modifier keys |
| `type` | Type text into the focused element |
| `key` | Press keyboard keys (`Enter`, `Tab`, `ctrl+a`, `cmd+c`, etc.) |
| `scroll` | Scroll directionally at coordinates, or scroll element into view by ref |
| `hover` | Move mouse to reveal tooltips/dropdowns without clicking |
| `drag` | Drag from one coordinate to another |
| `read_page` | Get accessibility tree with element refs. Filter by `interactive` or `all` |
| `find` | Find elements by natural language query (e.g. "login button") |
| `form_input` | Set value for input, select, checkbox, or radio by ref |
| `javascript_exec` | Execute JavaScript in the page context |
| `wait_for` | Wait for a CSS selector to appear, navigation, or a timeout |
| `get_page_text` | Extract clean text content from the page |
| `handle_dialog` | Accept or dismiss JS dialogs (alert/confirm/prompt) |

### Tab Management

| Tool | Description |
|---|---|
| `tabs_context` | Get current agent's tab group info |
| `tabs_create` | Create a new tab in the agent's group |
| `tab_close` | Close a specific tab |
| `select_tab` | Focus a specific tab |

### Debug

| Tool | Description |
|---|---|
| `read_console_messages` | Read console logs/errors with regex filtering |
| `read_network_requests` | Read HTTP requests/responses with URL pattern filtering |

### Advanced

| Tool | Description |
|---|---|
| `gif_creator` | Record browser actions and export as animated GIF |
| `upload_image` | Upload image to a file input or drag-and-drop target |
| `update_plan` | Present an action plan to the user for approval |
| `resize_window` | Set browser window dimensions |
| `shortcuts_list` | List available shortcuts and workflows |
| `shortcuts_execute` | Execute a shortcut or workflow |
| `switch_browser` | Switch to a different Chrome instance |

### Agent Integration

| Tool | Description |
|---|---|
| `agent_tab_assign` | Assign a tab group to an agent (exclusive control) |
| `agent_tab_list` | List all agent-to-tab-group mappings |
| `browser_event_subscribe` | Subscribe to browser events (page load, navigation, network, etc.) |
| `browser_event_unsubscribe` | Unsubscribe from browser events |
| `artifact_from_page` | Save page as HTML, PDF, or screenshot artifact |
| `page_data_extract` | Extract structured data from a page using a schema |
| `browser_health` | Check extension connection and CDP status |

## Browser Events

Subscribe to real-time browser events for reactive automation:

| Event | Description |
|---|---|
| `browser.page_load` | Page fully loaded |
| `browser.page_navigate` | Navigation started or completed |
| `browser.dom_mutation` | DOM element added, removed, or modified |
| `browser.network_request` | HTTP request initiated |
| `browser.network_response` | HTTP response received |
| `browser.tab_created` | New tab created |
| `browser.tab_closed` | Tab closed |
| `browser.tab_updated` | Tab title, URL, or favicon changed |
| `browser.console_error` | JavaScript error logged |
| `browser.form_submitted` | Form submit event |

Events support URL pattern filtering and additional conditions (CSS selector, HTTP method, status code).

## Architecture

### Monorepo Structure

```
viyv-browser/
├── packages/
│   ├── shared/            # Protocol types, constants, event definitions
│   └── mcp-server/        # MCP Server + Native Messaging Host bridge
├── apps/
│   └── chrome-extension/  # Chrome Extension (Manifest V3)
├── turbo.json             # Turborepo config
└── pnpm-workspace.yaml
```

### Key Design Decisions

- **Native Messaging** for Chrome-to-MCP communication — no network ports, no CORS issues
- **Tab Group isolation** — each AI agent gets its own color-coded tab group with exclusive control
- **CDP lazy attach** — debugger is attached on demand and detached after 5s idle to reduce overhead
- **JPEG screenshots** (quality 80) by default to stay within the 1MB Native Messaging limit
- **Message chunking & compression** — large payloads are gzip-compressed and split into 768KB chunks
- **Exponential backoff reconnection** — 1s → 2s → 4s → 8s → 16s → 30s max
- **Fixed Unix socket path** (`/tmp/viyv-browser.sock`) for reliable reconnection after crashes

### Security Model

- **Tab locks** prevent concurrent access from multiple agents (mutex with 60s TTL)
- **Session tokens** authenticate each agent connection
- **Permission prompts** let the user approve or deny tool calls in the extension UI
- **Protocol version handshake** ensures compatibility between server and extension

## CLI Reference

```bash
# Start MCP Server (default mode - connects to AI agents via stdio)
viyv-browser-mcp

# Start with a named agent session
viyv-browser-mcp --agent-name "my-agent"

# Native Host mode (called by Chrome, not manually)
viyv-browser-mcp --native-host

# Register Native Messaging Host manifest
viyv-browser-mcp setup

# Register with a specific extension ID (for production)
viyv-browser-mcp setup --extension-id "your-extension-id"
```

### Native Host Registration Paths

| Platform | Manifest Location |
|---|---|
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.viyv.browser.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/com.viyv.browser.json` |
| Windows | `%LOCALAPPDATA%/Google/Chrome/User Data/NativeMessagingHosts/com.viyv.browser.json` |

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Chrome browser

### Commands

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm dev            # Watch mode (hot rebuild)
pnpm lint           # Biome lint check
pnpm lint:fix       # Auto-fix lint issues
pnpm typecheck      # TypeScript strict check
```

### Code Style

- **Biome**: single quotes, no semicolons, 2-space indent, 100 char line width
- **TypeScript** strict mode
- **ESM** modules throughout

### Build Outputs

| Package | Output |
|---|---|
| `@viyv-browser/shared` | `packages/shared/dist/` (tsc) |
| `viyv-browser-mcp` | `packages/mcp-server/dist/` (tsup, shared bundled in) |
| `@viyv-browser/chrome-extension` | `apps/chrome-extension/build/` (vite) |

## Troubleshooting

**Extension not connecting?**
- Ensure the MCP server is running (`ls /tmp/viyv-browser.sock`)
- Re-run `viyv-browser-mcp setup` to register the Native Host
- Reload the extension from `chrome://extensions/`

**Screenshots too large?**
- JPEG is used by default (quality 80). For large pages, use the `region` parameter to capture a specific area.

**Tab group conflicts?**
- Each agent gets exclusive control of its tab group. If an agent disconnects without cleanup, the lock expires after 60 seconds.

**Service Worker restarting?**
- The extension uses keep-alive mechanisms (storage writes every 25s, Chrome alarms). Sessions are recovered automatically on restart.

## License

MIT
