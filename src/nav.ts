import type { BridgeClient } from "./bridge.js";
import { UnsupportedError } from "./errors.js";
import { GuestOpenAppImpl } from "./guest.js";
import type { AllowedRoute, ClientContext, GuestOpenApp as IGuestOpenApp, SDKNav } from "./types.js";

export class SDKNavImpl implements SDKNav {
  private readonly _guestOpenApp: IGuestOpenApp;

  public constructor(
    private readonly _bridge: BridgeClient | null,
    private readonly _context: ClientContext,
  ) {
    this._guestOpenApp = new GuestOpenAppImpl();
  }

  public async internal(route: AllowedRoute, query?: Record<string, string | number>): Promise<void> {
    if (this._context === "guest") {
      // guest：转为 openApp 深链
      this._guestOpenApp.openApp(route, query);
      return;
    }
    if (!this._bridge) {
      throw new UnsupportedError("nav.internal", this._context);
    }
    await this._bridge.send("nav.internal", { route, query: query ?? {} });
  }

  public async external(url: string): Promise<void> {
    if (this._context === "guest") {
      window.open(url, "_blank");
      return;
    }
    if (!this._bridge) {
      throw new UnsupportedError("nav.external", this._context);
    }
    await this._bridge.send("nav.external", { url });
  }
}
