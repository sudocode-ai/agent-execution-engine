/**
 * JSONRPC 2.0 error codes used by ACP
 *
 * Based on JSONRPC 2.0 specification:
 * https://www.jsonrpc.org/specification#error_object
 */
export enum AcpErrorCode {
  /** Invalid JSON was received */
  ParseError = -32700,

  /** JSON is not a valid Request object */
  InvalidRequest = -32600,

  /** Method does not exist or is not available */
  MethodNotFound = -32601,

  /** Invalid method parameters */
  InvalidParams = -32602,

  /** Internal error */
  InternalError = -32603,

  /** Server error (reserved for implementation-defined errors) */
  ServerError = -32000,
}

/**
 * ACP-specific error class for JSONRPC errors
 *
 * @example
 * ```typescript
 * throw new AcpError(
 *   AcpErrorCode.MethodNotFound,
 *   'readTextFile not supported'
 * );
 * ```
 */
export class AcpError extends Error {
  /**
   * JSONRPC error code
   */
  public readonly code: AcpErrorCode;

  /**
   * Optional additional data
   */
  public readonly data?: unknown;

  constructor(code: AcpErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = 'AcpError';
    this.code = code;
    this.data = data;

    // Maintain proper stack trace (only for V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AcpError);
    }
  }

  /**
   * Convert to JSONRPC error object
   *
   * @returns JSONRPC error object
   */
  toJsonRpc(): { code: number; message: string; data?: unknown } {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    };
  }

  /**
   * Create AcpError from JSONRPC error object
   *
   * @param error - JSONRPC error object
   * @returns AcpError instance
   */
  static fromJsonRpc(error: {
    code: number;
    message: string;
    data?: unknown;
  }): AcpError {
    // Map code to known AcpErrorCode or use as-is
    const code = Object.values(AcpErrorCode).includes(error.code)
      ? (error.code as AcpErrorCode)
      : AcpErrorCode.InternalError;

    return new AcpError(code, error.message, error.data);
  }
}
