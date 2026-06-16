import type { BridgeClient } from "./bridge.js";
import type { SDKEvents, ViewportInfo } from "./types.js";

type TokenChangedHandler = (newToken: string | null) => void;
type ViewportHandler = (info: ViewportInfo) => void;
type BackHandler = (ev: { preventDefault(): void }) => void;
type AnyHandler = TokenChangedHandler | ViewportHandler | BackHandler;

interface HandlerEntry {
  event: string;
  handler: AnyHandler;
  bridgeHandler: (data: unknown) => void;
}

export class SDKEventsImpl implements SDKEvents {
  private readonly _entries: HandlerEntry[] = [];
  // tokenChanged 不直接订阅 bridge：宿主事件里 token 恒为 null，
  // 真正的新 token 由 SDK 内部 re-exchange 完成后经 notifyTokenChanged 下发。
  private readonly _tokenChangedHandlers = new Set<TokenChangedHandler>();

  public constructor(private readonly _bridge: BridgeClient | null) {}

  public on(event: "tokenChanged", handler: TokenChangedHandler): () => void;
  public on(event: "viewport", handler: ViewportHandler): () => void;
  public on(event: "back", handler: BackHandler): () => void;
  public on(event: string, handler: AnyHandler): () => void {
    // tokenChanged：与 bridge 事件解耦，由 SDK 内部 re-exchange 后回调新 token
    if (event === "tokenChanged") {
      const h = handler as TokenChangedHandler;
      this._tokenChangedHandlers.add(h);
      return () => {
        this._tokenChangedHandlers.delete(h);
      };
    }

    if (!this._bridge) {
      // guest 模式：无宿主事件，返回空 unsubscribe
      return () => {};
    }

    let bridgeHandler: (data: unknown) => void;

    switch (event) {
      case "viewport": {
        const h = handler as ViewportHandler;
        bridgeHandler = (data: unknown) => {
          const raw = data as {
            safeTop?: number;
            safeBottom?: number;
            keyboardInset?: number;
            width?: number;
            height?: number;
          };
          h({
            safeTop: 0, // 固定 0，防双叠加
            safeBottom: raw.safeBottom ?? 0,
            keyboardInset: raw.keyboardInset ?? 0,
            width: raw.width ?? window.innerWidth,
            height: raw.height ?? window.innerHeight,
          });
        };
        break;
      }
      case "back": {
        const h = handler as BackHandler;
        bridgeHandler = (_data: unknown) => {
          let _defaultPrevented = false;
          h({
            preventDefault() {
              _defaultPrevented = true;
            },
          });
          // SDK 不需要把 defaultPrevented 回传给宿主；
          // 宿主侧设计为"等待一帧确认"（H8），此处不需要额外处理
        };
        break;
      }
      default:
        return () => {};
    }

    this._bridge.onEvent(event, bridgeHandler);
    const entry: HandlerEntry = { event, handler, bridgeHandler };
    this._entries.push(entry);

    return () => {
      this.off(event, handler as (...args: unknown[]) => void);
    };
  }

  /**
   * 由 SDK 内部在 re-exchange 完成后调用，向消费方下发最新 token。
   * 宿主 tokenChanged 事件本身不携带 token（恒 null），故新值取自 auth 当前 token。
   */
  public notifyTokenChanged(token: string | null): void {
    this._tokenChangedHandlers.forEach((h) => h(token));
  }

  public off(event: string, handler: (...args: unknown[]) => void): void {
    if (event === "tokenChanged") {
      this._tokenChangedHandlers.delete(handler as unknown as TokenChangedHandler);
      return;
    }
    const idx = this._entries.findIndex((e) => e.event === event && e.handler === handler);
    if (idx === -1) return;
    const entry = this._entries[idx]!;
    this._bridge?.offEvent(event, entry.bridgeHandler);
    this._entries.splice(idx, 1);
  }

  public destroy(): void {
    for (const entry of this._entries) {
      this._bridge?.offEvent(entry.event, entry.bridgeHandler);
    }
    this._entries.length = 0;
    this._tokenChangedHandlers.clear();
  }
}
