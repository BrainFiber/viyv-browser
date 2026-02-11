/**
 * Setup command: registers Native Messaging Host manifest.
 * `npx @viyv/browser-mcp setup`
 */

import { writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { execSync } from 'node:child_process'
import { NATIVE_HOST_NAME } from '@viyv-browser/shared'

interface SetupOptions {
  extensionId?: string
}

export function runSetup(options: SetupOptions = {}): void {
  const os = platform()
  const binaryPath = getBinaryPath()

  console.log('Viyv Browser MCP - Native Messaging Host Setup')
  console.log('================================================')
  console.log(`Platform: ${os}`)
  console.log(`Binary: ${binaryPath}`)

  // Verify binary path exists
  if (!existsSync(binaryPath)) {
    console.error(`WARNING: Binary not found at ${binaryPath}`)
    console.error('The Native Messaging Host may not work until the binary is available.')
  }

  const allowedOrigins = options.extensionId
    ? [`chrome-extension://${options.extensionId}/`]
    : ['chrome-extension://*/'] // Allow all during development

  // Security warning for wildcard origins
  if (!options.extensionId) {
    process.stderr.write(
      'WARNING: Using wildcard allowed_origins (chrome-extension://*/). ' +
      'This allows any Chrome extension to connect. ' +
      'For production, specify --extension-id to restrict access.\n',
    )
  }

  // Chrome Native Messaging Host manifest doesn't support args.
  // Create a wrapper script that launches the binary with --native-host flag.
  const wrapperPath = createNativeHostWrapper(os, binaryPath)

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Viyv Browser MCP Native Messaging Host',
    path: wrapperPath,
    type: 'stdio',
    allowed_origins: allowedOrigins,
  }

  const manifestPath = getManifestPath(os)
  const manifestDir = dirname(manifestPath)

  console.log(`Wrapper: ${wrapperPath}`)
  console.log(`Manifest path: ${manifestPath}`)

  mkdirSync(manifestDir, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  chmodSync(manifestPath, 0o644)

  console.log('\nNative Messaging Host registered successfully!')
  console.log('\nNext steps:')
  console.log('1. Start the MCP Server: node <path>/dist/index.js')
  console.log('2. Install the Viyv Browser Chrome Extension')
  console.log('3. Click the extension icon to connect')
}

function getBinaryPath(): string {
  // Find the actual binary path
  const whichCmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const found = execSync(`${whichCmd} viyv-browser-mcp`, { encoding: 'utf-8' }).trim()
    if (found) return found
  } catch {
    // Not globally installed, use npx path
  }

  // Fallback: resolve from current module
  const currentScript = process.argv[1]
  return resolve(currentScript)
}

function createNativeHostWrapper(os: string, binaryPath: string): string {
  const manifestDir = dirname(getManifestPath(os))
  mkdirSync(manifestDir, { recursive: true })

  // Chrome launches native hosts in a clean environment without user's PATH.
  // We must use the absolute path to node, not rely on #!/usr/bin/env node.
  const nodePath = getNodePath()

  if (os === 'win32') {
    // Windows: .bat wrapper
    const wrapperPath = resolve(manifestDir, `${NATIVE_HOST_NAME}.bat`)
    writeFileSync(wrapperPath, `@echo off\r\n"${nodePath}" "${binaryPath}" --native-host\r\n`)
    return wrapperPath
  }

  // macOS/Linux: shell wrapper
  const wrapperPath = resolve(manifestDir, `${NATIVE_HOST_NAME}.sh`)
  writeFileSync(
    wrapperPath,
    `#!/bin/bash\nexec "${nodePath}" "${binaryPath}" --native-host\n`,
  )
  chmodSync(wrapperPath, 0o755)
  return wrapperPath
}

function getNodePath(): string {
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim()
  } catch {
    // Fallback: use the current process's node binary
    return process.execPath
  }
}

function getManifestPath(os: string): string {
  const home = homedir()

  switch (os) {
    case 'darwin':
      return resolve(
        home,
        'Library/Application Support/Google/Chrome/NativeMessagingHosts',
        `${NATIVE_HOST_NAME}.json`,
      )
    case 'linux':
      return resolve(
        home,
        '.config/google-chrome/NativeMessagingHosts',
        `${NATIVE_HOST_NAME}.json`,
      )
    case 'win32':
      // On Windows, we'd also need to create a registry entry
      return resolve(
        home,
        'AppData/Local/Google/Chrome/User Data/NativeMessagingHosts',
        `${NATIVE_HOST_NAME}.json`,
      )
    default:
      throw new Error(`Unsupported platform: ${os}`)
  }
}
