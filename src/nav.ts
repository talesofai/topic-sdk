import type { BridgeClient } from "./bridge.js";
import { UnsupportedError } from "./errors.js";
import type { AllowedRoute, ClientContext, SDKNav } from "./types.js";

/**
 * 自指路由：参数=「当前这个」，缺省时 SDK 从当前页 URL 自动填（创作者可显式覆盖）。
 * 宿主把 hashtag / activity_uuid 作为 query 注入 iframe src，故内嵌页 `location.search` 必有这些值。
 */
const SELF_PARAM_FROM_URL: Partial<Record<AllowedRoute, { param: string; urlKey: string }>> = {
  "/topic": { param: "hashtag", urlKey: "hashtag" },
  "/tag": { param: "hashtag", urlKey: "hashtag" },
  "/activity": { param: "uuid", urlKey: "activity_uuid" },
};

/** per-item 路由：参数指向「具体某个」实体（来自被点卡片），SDK 无从代填 → 缺则抛错打回。 */
const REQUIRED_PARAMS: Partial<Record<AllowedRoute, readonly string[]>> = {
  "/oc": ["uuid"],
  "/user": ["uuid"],
  "/collection/interaction": ["uuid"],
};

const isBlank = (v: unknown): boolean => v === undefined || v === null || v === "";

export class SDKNavImpl implements SDKNav {
  public constructor(
    private readonly _bridge: BridgeClient | null,
    private readonly _context: ClientContext,
  ) {}

  /**
   * 解析最终 query：自指路由缺参从 URL 自动填；per-item 路由缺必需参数则抛错（开发期就被打回，而非线上白屏）。
   */
  private _resolveQuery(route: AllowedRoute, query?: Record<string, string | number>): Record<string, string | number> {
    const q: Record<string, string | number> = { ...(query ?? {}) };

    // 1) 自指路由：缺参从当前页 URL 自动填
    const selfRef = SELF_PARAM_FROM_URL[route];
    if (selfRef && isBlank(q[selfRef.param]) && typeof window !== "undefined") {
      const fromUrl = new URLSearchParams(window.location.search).get(selfRef.urlKey);
      if (fromUrl) q[selfRef.param] = fromUrl;
    }

    // 2) 必需参数校验（自指填完后再查）
    const required = REQUIRED_PARAMS[route] ?? (selfRef ? [selfRef.param] : []);
    for (const p of required) {
      if (isBlank(q[p])) {
        const hint = selfRef
          ? `该自指路由通常由 SDK 从当前页 ?${selfRef.urlKey}= 自动填，但当前 URL 没有该值`
          : `该路由指向具体实体，请从被点卡片数据传入 ${p}（如 ${p}: story.uuid）`;
        throw new Error(`[topic-sdk] nav.internal('${route}') 缺少必需参数 '${p}'。${hint}。`);
      }
    }
    return q;
  }

  public async internal(route: AllowedRoute, query?: Record<string, string | number>): Promise<void> {
    const effectiveQuery = this._resolveQuery(route, query);
    if (this._context === "guest") {
      // guest（仅本地 dev 无宿主）：_resolveQuery 已先跑（保留缺参 throw）；无宿主不跳转，生产由宿主唤起 / 站内跳。
      console.info("[topic-sdk] nav.internal(route) 本地 dev 无宿主不跳转;生产由宿主唤起/站内跳");
      return;
    }
    if (!this._bridge) {
      throw new UnsupportedError("nav.internal", this._context);
    }
    await this._bridge.send("nav.internal", { route, query: effectiveQuery });
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
