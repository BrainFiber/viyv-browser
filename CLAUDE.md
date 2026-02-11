# CLAUDE.md - viyv-browser

## Project Overview
Chrome Extension + MCP Server for AI agent browser automation.
Enables AI agents to operate in the user's real browser with login sessions.

## Architecture
- **@viyv-browser/shared** - Protocol types, constants (packages/shared)
- **@viyv-browser/mcp-server** - MCP Server + Native Messaging Host (packages/mcp-server)
- **@viyv-browser/chrome-extension** - Chrome Extension MV3 (apps/chrome-extension)

## Development
```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm dev            # Watch mode
pnpm lint           # Biome lint
pnpm typecheck      # TypeScript check
```

## Code Style
- Biome: single quotes, no semicolons, 2-space indent, 100 char width
- TypeScript strict mode
- ESM modules throughout

## Key Design Decisions
- Native Messaging for Chrome ↔ MCP Server communication
- Tab Groups for multi-agent isolation
- CDP lazy attach (attach on demand, detach after 5s idle)
- JPEG screenshots by default (quality 80) for 1MB message limit
- Unix socket for MCP Server ↔ Native Host bridge
