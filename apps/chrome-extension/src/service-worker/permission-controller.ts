/**
 * Simple permission controller for agent operations.
 * Side Panel UI can prompt user for approval on sensitive operations.
 */

type PermissionRequest = {
  id: string
  agentId: string
  tool: string
  description: string
  resolve: (approved: boolean) => void
  timestamp: number
}

const pendingPermissions = new Map<string, PermissionRequest>()

/** Auto-approve all for now; will integrate with Side Panel UI later */
export async function checkPermission(
  _agentId: string,
  _tool: string,
  _input: Record<string, unknown>,
): Promise<boolean> {
  return true
}

export function getPendingPermissions(): PermissionRequest[] {
  return Array.from(pendingPermissions.values())
}

export function resolvePermission(requestId: string, approved: boolean) {
  const req = pendingPermissions.get(requestId)
  if (req) {
    req.resolve(approved)
    pendingPermissions.delete(requestId)
  }
}
