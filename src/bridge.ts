import { BridgeError } from "./errors.js";
import type { HelloResult } from "./types.js";

// ————— wire 协议类型 —————

interface BridgeRequest {
  v: 2;
  id: string;
  method: string;
  params?: unknown;
}

interface BridgeResponse {
  v: 2;
  id: string;
  ok: true;
  result: unknown;
}

interface BridgeErrorResponse {
  v: 2;
  id: string;
  ok: false;
  error: { code: string; message: string };
}

interface BridgeEventMessage {
  v: 2;
  event: "tokenChanged" | "viewport" | "back";
  data: unknown;
}

type IncomingMessage = BridgeResponse | BridgeErrorResponse | BridgeEventMessage;

// ————— ID 生成 —————

let _counter = 0;
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // counter fallback（极少数旧环境）
  _counter += 1;
  return `sdk-req-${Date.now()}-${_counter}`;
}

// ————— pending request 类型 —————

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

type EventHandler = (data: unknown) => void;

// ————— BridgeClient —————

/**
 * frame-bridge v2 客户端。
 * 负责与宿主（window.parent）通过 postMessage 通信。
 */
export class BridgeClient {
  private readonly _pending = new Map<string, PendingRequest>();
  private readonly _eventHandlers = new Map<string, Set<EventHandler>>();
  private readonly _defaultTimeout: number;
  private _destroyed = false;

  public constructor(defaultTimeout = 3000) {
    this._defaultTimeout = defaultTimeout;
    window.addEventListener("message", this._onMessage);
  }

  /**
   * 向宿主发送请求，等待回包。
   */
  public send<T = unknown>(method: string, params?: unknown, timeout?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = generateId();
      const effectiveTimeout = timeout ?? this._defaultTimeout;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new BridgeError("timeout", method, id));
      }, effectiveTimeout);

      this._pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        method,
      });

      const request: BridgeRequest = { v: 2, id, method, params };
      window.parent.postMessage(request, "*");
    });
  }

  /**
   * 订阅宿主主动推送的事件。
   */
  public onEvent(event: string, handler: EventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * 取消订阅。
   */
  public offEvent(event: string, handler: EventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * hello 握手。
   * 超时时返回 null（表示 guest 模式）。
   */
  public async hello(sdkVersion: string, timeout?: number): Promise<HelloResult | null> {
    try {
      const result = await this.send<HelloResult>("hello", { sdkVersion }, timeout);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * 销毁，清理所有 listener 和 pending。
   */
  public destroy(): void {
    this._destroyed = true;
    window.removeEventListener("message", this._onMessage);

    // 清除所有 pending 请求
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeError("timeout", pending.method, id));
    }
    this._pending.clear();
    this._eventHandlers.clear();
  }

  private _onMessage = (ev: MessageEvent): void => {
    if (this._destroyed) return;

    // 只接受来自宿主父窗口的消息，丢弃任意 iframe/opener 伪造的回包/事件
    // （否则可伪造 hello 把 guest 骗成 embedded、或伪造 getEmbedToken 注入假 token）
    if (ev.source !== window.parent) return;

    let msg: IncomingMessage;
    try {
      // data 可能已经是对象（同 origin），或是序列化字符串
      msg = typeof ev.data === "string" ? (JSON.parse(ev.data) as IncomingMessage) : (ev.data as IncomingMessage);
    } catch {
      return;
    }

    if (!msg || msg.v !== 2) return;

    // 事件推送（无 id 字段）
    if ("event" in msg) {
      const handlers = this._eventHandlers.get(msg.event);
      if (handlers) {
        handlers.forEach((h) => h(msg.data));
      }
      return;
    }

    // 请求回包（有 id 字段）
    if ("id" in msg) {
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this._pending.delete(msg.id);

      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new BridgeError("rejected", pending.method, msg.id));
      }
    }
  };
}
