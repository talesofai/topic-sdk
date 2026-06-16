import type { Capability, ClientContext } from "./types.js";

/**
 * HTTP API 错误
 * statusCode -1 = 网络错误/解析失败
 */
export class TopicApiError extends Error {
  public readonly cause?: unknown;

  public constructor(
    public readonly statusCode: number,
    message: string,
    public readonly endpoint: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "TopicApiError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * frame-bridge 通信错误
 */
export class BridgeError extends Error {
  public readonly cause?: unknown;

  public constructor(
    public readonly code: "timeout" | "rejected" | "origin-mismatch" | "method-not-allowed" | "parse-error",
    public readonly method: string,
    public readonly requestId: string,
    cause?: unknown,
  ) {
    super(`Bridge error [${code}] on method ${method}`);
    this.name = "BridgeError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * 能力不支持错误（不静默 no-op，统一抛出）
 */
export class UnsupportedError extends Error {
  public constructor(
    public readonly capability: Capability | string,
    public readonly context: ClientContext,
  ) {
    super(`Capability '${capability}' not supported in context '${context}'`);
    this.name = "UnsupportedError";
  }
}
