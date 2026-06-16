import type { BridgeClient } from "./bridge.js";
import type { SDKAuth } from "./types.js";

interface EmbedTokenResult {
  // 宿主回包字段名为 embedToken（对齐后端 EmbedTokenResponse.embedToken）
  embedToken: string;
  expiresAt: number | null; // UTC ms；宿主可能回 null
}

export class SDKAuthImpl implements SDKAuth {
  private _token: string | null = null;
  private _expiresAt: number | null = null;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly _bridge: BridgeClient | null,
    private readonly _tokenTimeout: number,
    private readonly _tokenRefreshEarlyMs: number,
    private readonly _onAuthLost: ((reason: string) => void) | undefined,
  ) {}

  // ————— SDKAuth 公开 API —————

  public getToken(): string | null {
    return this._token;
  }

  public getExpiresAt(): number | null {
    return this._expiresAt;
  }

  public isAuthenticated(): boolean {
    return !!this._token && !this._isExpired();
  }

  // ————— 内部 API —————

  /**
   * 初始化鉴权：向 bridge 请求 embed token。
   * guest 模式（无 bridge）：直接以匿名模式初始化，不抛错。
   */
  public async init(): Promise<void> {
    if (!this._bridge) {
      // guest 模式：匿名
      return;
    }
    await this._fetchToken();
  }

  /**
   * 宿主推送 tokenChanged 事件时调用（清除旧 token 并重新请求）。
   */
  public async handleTokenChanged(): Promise<void> {
    this._clearToken();
    if (!this._bridge) return;
    await this._fetchToken();
  }

  public destroy(): void {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ————— 私有方法 —————

  private async _fetchToken(retryCount = 0): Promise<void> {
    if (!this._bridge) return;

    try {
      const result = await this._bridge.send<EmbedTokenResult>("getEmbedToken", undefined, this._tokenTimeout);
      if (!result || !result.embedToken) {
        throw new Error("getEmbedToken returned no embedToken");
      }
      this._token = result.embedToken;
      this._expiresAt = result.expiresAt ?? null;
      this._scheduleRefresh();
    } catch (err) {
      if (retryCount < 1) {
        // exponential backoff：第一次重试等 500ms
        await delay(500 * Math.pow(2, retryCount));
        return this._fetchToken(retryCount + 1);
      }
      // 达到最大重试次数
      this._onAuthLost?.(`Failed to get embed token: ${String(err)}`);
    }
  }

  private _scheduleRefresh(): void {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._expiresAt === null) return;

    const now = Date.now();
    const delay = this._expiresAt - now - this._tokenRefreshEarlyMs;
    if (delay <= 0) {
      // 已过期或即将过期，立即重取
      this._fetchToken().catch(() => {});
      return;
    }

    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this._fetchToken().catch(() => {});
    }, delay);
  }

  private _clearToken(): void {
    this._token = null;
    this._expiresAt = null;
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  private _isExpired(): boolean {
    if (this._expiresAt === null) return false;
    return Date.now() > this._expiresAt;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
