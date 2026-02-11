export type ErrorCode =
  | 'EXTENSION_NOT_CONNECTED'
  | 'TAB_NOT_FOUND'
  | 'TAB_ACCESS_DENIED'
  | 'DEBUGGER_ATTACH_FAILED'
  | 'DEBUGGER_IN_USE'
  | 'CDP_ERROR'
  | 'TIMEOUT'
  | 'MESSAGE_TOO_LARGE'
  | 'CHUNK_REASSEMBLY_FAILED'
  | 'SESSION_EXPIRED'
  | 'EXTENSION_SUSPENDED'
  | 'DIALOG_BLOCKING'
  | 'INVALID_PARAMS'
  | 'UNKNOWN_TOOL'
  | 'INTERNAL_ERROR'

export class ViyvBrowserError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ViyvBrowserError'
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}
