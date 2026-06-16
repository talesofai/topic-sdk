import type { BridgeClient } from "./bridge.js";
import { UnsupportedError } from "./errors.js";
import type { ClientContext, SDKUi, ViewportInfo } from "./types.js";

export class SDKUiImpl implements SDKUi {
  public constructor(
    private readonly _bridge: BridgeClient | null,
    private readonly _context: ClientContext,
  ) {}

  public async toast(text: string, options?: { duration?: number; level?: "info" | "warn" }): Promise<void> {
    if (this._context === "guest" || !this._bridge) {
      throw new UnsupportedError("ui.toast", this._context);
    }
    await this._bridge.send("ui.toast", {
      text,
      duration: options?.duration,
      level: options?.level ?? "info",
    });
  }

  public async viewport(): Promise<ViewportInfo> {
    if (this._context === "guest" || !this._bridge) {
      throw new UnsupportedError("ui.viewport", this._context);
    }
    const raw = await this._bridge.send<{
      safeTop?: number;
      safeBottom?: number;
      keyboardInset?: number;
      width?: number;
      height?: number;
    }>("ui.viewport");

    // safeTop 固定返回 0（防双叠加，宿主已 safeTop:true/page.tsx:39）
    // 其余字段对宿主漏传做兜底，与 events.ts viewport 分支保持一致
    return {
      safeTop: 0,
      safeBottom: raw.safeBottom ?? 0,
      keyboardInset: raw.keyboardInset ?? 0,
      width: raw.width ?? window.innerWidth,
      height: raw.height ?? window.innerHeight,
    };
  }
}
