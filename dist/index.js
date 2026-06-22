// src/auth.ts
var SDKAuthImpl = class {
  constructor(_bridge, _tokenTimeout, _tokenRefreshEarlyMs, _onAuthLost) {
    this._bridge = _bridge;
    this._tokenTimeout = _tokenTimeout;
    this._tokenRefreshEarlyMs = _tokenRefreshEarlyMs;
    this._onAuthLost = _onAuthLost;
    this._token = null;
    this._expiresAt = null;
    this._refreshTimer = null;
  }
  // ————— SDKAuth 公开 API —————
  getToken() {
    return this._token;
  }
  getExpiresAt() {
    return this._expiresAt;
  }
  isAuthenticated() {
    return !!this._token && !this._isExpired();
  }
  // ————— 内部 API —————
  /**
   * 初始化鉴权：向 bridge 请求 embed token。
   * guest 模式（无 bridge）：直接以匿名模式初始化，不抛错。
   */
  async init() {
    if (!this._bridge) {
      return;
    }
    await this._fetchToken();
  }
  /**
   * 宿主推送 tokenChanged 事件时调用（清除旧 token 并重新请求）。
   */
  async handleTokenChanged() {
    this._clearToken();
    if (!this._bridge)
      return;
    await this._fetchToken();
  }
  destroy() {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
  // ————— 私有方法 —————
  async _fetchToken(retryCount = 0) {
    if (!this._bridge)
      return;
    try {
      const result = await this._bridge.send("getEmbedToken", void 0, this._tokenTimeout);
      if (!result || !result.embedToken) {
        throw new Error("getEmbedToken returned no embedToken");
      }
      this._token = result.embedToken;
      this._expiresAt = result.expiresAt ?? null;
      this._scheduleRefresh();
    } catch (err) {
      if (retryCount < 1) {
        await delay(500 * Math.pow(2, retryCount));
        return this._fetchToken(retryCount + 1);
      }
      this._onAuthLost?.(`Failed to get embed token: ${String(err)}`);
    }
  }
  _scheduleRefresh() {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._expiresAt === null)
      return;
    const now = Date.now();
    const delay2 = this._expiresAt - now - this._tokenRefreshEarlyMs;
    if (delay2 <= 0) {
      this._fetchToken().catch(() => {
      });
      return;
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this._fetchToken().catch(() => {
      });
    }, delay2);
  }
  _clearToken() {
    this._token = null;
    this._expiresAt = null;
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
  _isExpired() {
    if (this._expiresAt === null)
      return false;
    return Date.now() > this._expiresAt;
  }
};
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// src/errors.ts
var TopicApiError = class extends Error {
  constructor(statusCode, message, endpoint, cause) {
    super(message);
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.name = "TopicApiError";
    if (cause !== void 0) {
      this.cause = cause;
    }
  }
};
var BridgeError = class extends Error {
  constructor(code, method, requestId, cause) {
    super(`Bridge error [${code}] on method ${method}`);
    this.code = code;
    this.method = method;
    this.requestId = requestId;
    this.name = "BridgeError";
    if (cause !== void 0) {
      this.cause = cause;
    }
  }
};
var UnsupportedError = class extends Error {
  constructor(capability, context) {
    super(`Capability '${capability}' not supported in context '${context}'`);
    this.capability = capability;
    this.context = context;
    this.name = "UnsupportedError";
  }
};

// src/bridge.ts
var _counter = 0;
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  _counter += 1;
  return `sdk-req-${Date.now()}-${_counter}`;
}
var BridgeClient = class {
  constructor(defaultTimeout = 3e3) {
    this._pending = /* @__PURE__ */ new Map();
    this._eventHandlers = /* @__PURE__ */ new Map();
    this._destroyed = false;
    this._onMessage = (ev) => {
      if (this._destroyed)
        return;
      if (ev.source !== window.parent)
        return;
      let msg;
      try {
        msg = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (!msg || msg.v !== 2)
        return;
      if ("event" in msg) {
        const handlers = this._eventHandlers.get(msg.event);
        if (handlers) {
          handlers.forEach((h) => h(msg.data));
        }
        return;
      }
      if ("id" in msg) {
        const pending = this._pending.get(msg.id);
        if (!pending)
          return;
        clearTimeout(pending.timer);
        this._pending.delete(msg.id);
        if (msg.ok) {
          pending.resolve(msg.result);
        } else {
          pending.reject(new BridgeError("rejected", pending.method, msg.id));
        }
      }
    };
    this._defaultTimeout = defaultTimeout;
    window.addEventListener("message", this._onMessage);
  }
  /**
   * 向宿主发送请求，等待回包。
   */
  send(method, params, timeout) {
    return new Promise((resolve, reject) => {
      const id = generateId();
      const effectiveTimeout = timeout ?? this._defaultTimeout;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new BridgeError("timeout", method, id));
      }, effectiveTimeout);
      this._pending.set(id, {
        resolve,
        reject,
        timer,
        method
      });
      const request = { v: 2, id, method, params };
      window.parent.postMessage(request, "*");
    });
  }
  /**
   * 订阅宿主主动推送的事件。
   */
  onEvent(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, /* @__PURE__ */ new Set());
    }
    this._eventHandlers.get(event).add(handler);
  }
  /**
   * 取消订阅。
   */
  offEvent(event, handler) {
    this._eventHandlers.get(event)?.delete(handler);
  }
  /**
   * hello 握手。
   * 超时时返回 null（表示 guest 模式）。
   */
  async hello(sdkVersion, timeout) {
    try {
      const result = await this.send("hello", { sdkVersion }, timeout);
      return result;
    } catch {
      return null;
    }
  }
  /**
   * 销毁，清理所有 listener 和 pending。
   */
  destroy() {
    this._destroyed = true;
    window.removeEventListener("message", this._onMessage);
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeError("timeout", pending.method, id));
    }
    this._pending.clear();
    this._eventHandlers.clear();
  }
};

// src/data.ts
async function apiFetch(baseUrl, path, auth, query) {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === void 0)
        continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          url.searchParams.append(k, String(item));
        }
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const headers = {
    "Content-Type": "application/json"
  };
  const token = auth.getToken();
  if (token) {
    headers["x-embed-token"] = token;
  }
  let response;
  try {
    response = await fetch(url.toString(), { method: "GET", headers });
  } catch (err) {
    throw new TopicApiError(-1, "Network error", path, err);
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.message)
        message = body.message;
    } catch {
    }
    throw new TopicApiError(response.status, message, path);
  }
  try {
    return await response.json();
  } catch (err) {
    throw new TopicApiError(-1, "JSON parse error", path, err);
  }
}
var SDKTopicImpl = class {
  constructor(_baseUrl, _auth) {
    this._baseUrl = _baseUrl;
    this._auth = _auth;
  }
  async getDetail(name) {
    return apiFetch(this._baseUrl, `/v1/embed/topic/${encodeURIComponent(name)}`, this._auth);
  }
  async listStories(name, query) {
    return apiFetch(this._baseUrl, `/v1/embed/topic/${encodeURIComponent(name)}/stories`, this._auth, {
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      sort: query.sort
    });
  }
  async listCharacters(name, query) {
    return apiFetch(
      this._baseUrl,
      `/v1/embed/topic/${encodeURIComponent(name)}/characters`,
      this._auth,
      {
        parentType: query.parentType,
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        sort: query.sort
      }
    );
  }
  async listCampaigns(name, query) {
    return apiFetch(
      this._baseUrl,
      `/v1/embed/topic/${encodeURIComponent(name)}/campaigns`,
      this._auth,
      {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize
      }
    );
  }
  async listLoreEvents(name) {
    return apiFetch(this._baseUrl, `/v1/embed/topic/${encodeURIComponent(name)}/lore-events`, this._auth);
  }
  async listHot(name) {
    const resp = await apiFetch(
      this._baseUrl,
      `/v1/embed/topic/${encodeURIComponent(name)}/hot-stories`,
      this._auth
    );
    return resp.stories;
  }
  async getWeeklyHottest(name) {
    return apiFetch(
      this._baseUrl,
      `/v1/embed/topic/${encodeURIComponent(name)}/weekly-hottest`,
      this._auth
    );
  }
};
var SDKActivityImpl = class {
  constructor(_baseUrl, _auth) {
    this._baseUrl = _baseUrl;
    this._auth = _auth;
  }
  async listTabs(uuid) {
    return apiFetch(this._baseUrl, `/v1/embed/activity/${encodeURIComponent(uuid)}/tabs`, this._auth);
  }
  async listSelectedStories(uuid, tabKey, query) {
    return apiFetch(
      this._baseUrl,
      `/v1/embed/activity/${encodeURIComponent(uuid)}/tab/${encodeURIComponent(tabKey)}`,
      this._auth,
      {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        sort: query.sort
      }
    );
  }
};
var SDKRankImpl = class {
  constructor(_baseUrl, _auth) {
    this._baseUrl = _baseUrl;
    this._auth = _auth;
  }
  async get(entity, window2, at) {
    if ((entity === "oc" || entity === "elementum") && at !== "latest") {
      throw new TopicApiError(
        400,
        `rank entity '${entity}' only supports at='latest'`,
        `/v1/embed/rank/${entity}/${window2}/${String(at)}`
      );
    }
    const atStr = at === "latest" ? "latest" : String(at);
    return apiFetch(
      this._baseUrl,
      `/v1/embed/rank/${encodeURIComponent(entity)}/${encodeURIComponent(window2)}/${encodeURIComponent(atStr)}`,
      this._auth
    );
  }
};
var PageCursor = class {
  constructor(_fetcher, _pageSize = 20) {
    this._fetcher = _fetcher;
    this._pageSize = _pageSize;
    this._pageIndex = 0;
    this._hasNext = true;
    this._total = null;
  }
  hasNext() {
    return this._hasNext;
  }
  async next() {
    if (!this._hasNext)
      return [];
    const page = await this._fetcher(this._pageIndex, this._pageSize);
    this._total = page.total;
    this._hasNext = page.hasNext;
    this._pageIndex += 1;
    return page.list;
  }
  reset() {
    this._pageIndex = 0;
    this._hasNext = true;
    this._total = null;
  }
  currentPage() {
    return this._pageIndex;
  }
  totalItems() {
    return this._total;
  }
};

// src/types.ts
var Capability = /* @__PURE__ */ ((Capability2) => {
  Capability2["ReadTopic"] = "read.topic";
  Capability2["ReadStories"] = "read.stories";
  Capability2["ReadCharacters"] = "read.characters";
  Capability2["ReadCampaigns"] = "read.campaigns";
  Capability2["ReadLoreEvents"] = "read.loreEvents";
  Capability2["ReadActivity"] = "read.activity";
  Capability2["ReadRank"] = "read.rank";
  Capability2["Bridge"] = "bridge";
  Capability2["NavInternal"] = "nav.internal";
  Capability2["NavExternal"] = "nav.external";
  Capability2["Toast"] = "ui.toast";
  Capability2["Viewport"] = "ui.viewport";
  Capability2["EventBack"] = "event.back";
  Capability2["EventTokenChanged"] = "event.tokenChanged";
  Capability2["EventViewport"] = "event.viewport";
  return Capability2;
})(Capability || {});

// src/env.ts
async function detectEnv(bridge, sdkVersion, helloTimeout) {
  const ua = navigator.userAgent;
  const activityUuid = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("activity_uuid") || null : null;
  if (/miniProgram/i.test(ua)) {
    throw new UnsupportedError("weapp-not-supported", "guest");
  }
  const hello = await bridge.hello(sdkVersion, helloTimeout);
  if (!hello) {
    return {
      context: "guest",
      embedded: false,
      client: "unknown",
      appVersion: null,
      features: [],
      hello: null,
      activityUuid
    };
  }
  const context = hello.client === "ios" || hello.client === "android" ? "app" : "web-embedded";
  return {
    context,
    embedded: true,
    client: hello.client,
    appVersion: hello.appVersion,
    features: hello.features,
    hello,
    activityUuid
  };
}
function buildCapabilities(env) {
  const caps = /* @__PURE__ */ new Set();
  caps.add("read.topic" /* ReadTopic */);
  caps.add("read.stories" /* ReadStories */);
  caps.add("read.characters" /* ReadCharacters */);
  caps.add("read.campaigns" /* ReadCampaigns */);
  caps.add("read.loreEvents" /* ReadLoreEvents */);
  caps.add("read.rank" /* ReadRank */);
  if (env.activityUuid) {
    caps.add("read.activity" /* ReadActivity */);
  }
  if (env.context !== "guest") {
    caps.add("bridge" /* Bridge */);
    caps.add("nav.internal" /* NavInternal */);
    caps.add("nav.external" /* NavExternal */);
    caps.add("ui.toast" /* Toast */);
    caps.add("ui.viewport" /* Viewport */);
    caps.add("event.back" /* EventBack */);
    caps.add("event.tokenChanged" /* EventTokenChanged */);
    caps.add("event.viewport" /* EventViewport */);
  }
  return caps;
}

// src/events.ts
var SDKEventsImpl = class {
  constructor(_bridge) {
    this._bridge = _bridge;
    this._entries = [];
    // tokenChanged 不直接订阅 bridge：宿主事件里 token 恒为 null，
    // 真正的新 token 由 SDK 内部 re-exchange 完成后经 notifyTokenChanged 下发。
    this._tokenChangedHandlers = /* @__PURE__ */ new Set();
  }
  on(event, handler) {
    if (event === "tokenChanged") {
      const h = handler;
      this._tokenChangedHandlers.add(h);
      return () => {
        this._tokenChangedHandlers.delete(h);
      };
    }
    if (!this._bridge) {
      return () => {
      };
    }
    let bridgeHandler;
    switch (event) {
      case "viewport": {
        const h = handler;
        bridgeHandler = (data) => {
          const raw = data;
          h({
            safeTop: 0,
            // 固定 0，防双叠加
            safeBottom: raw.safeBottom ?? 0,
            keyboardInset: raw.keyboardInset ?? 0,
            width: raw.width ?? window.innerWidth,
            height: raw.height ?? window.innerHeight
          });
        };
        break;
      }
      case "back": {
        const h = handler;
        bridgeHandler = (_data) => {
          let _defaultPrevented = false;
          h({
            preventDefault() {
              _defaultPrevented = true;
            }
          });
        };
        break;
      }
      default:
        return () => {
        };
    }
    this._bridge.onEvent(event, bridgeHandler);
    const entry = { event, handler, bridgeHandler };
    this._entries.push(entry);
    return () => {
      this.off(event, handler);
    };
  }
  /**
   * 由 SDK 内部在 re-exchange 完成后调用，向消费方下发最新 token。
   * 宿主 tokenChanged 事件本身不携带 token（恒 null），故新值取自 auth 当前 token。
   */
  notifyTokenChanged(token) {
    this._tokenChangedHandlers.forEach((h) => h(token));
  }
  off(event, handler) {
    if (event === "tokenChanged") {
      this._tokenChangedHandlers.delete(handler);
      return;
    }
    const idx = this._entries.findIndex((e) => e.event === event && e.handler === handler);
    if (idx === -1)
      return;
    const entry = this._entries[idx];
    this._bridge?.offEvent(event, entry.bridgeHandler);
    this._entries.splice(idx, 1);
  }
  destroy() {
    for (const entry of this._entries) {
      this._bridge?.offEvent(entry.event, entry.bridgeHandler);
    }
    this._entries.length = 0;
    this._tokenChangedHandlers.clear();
  }
};

// src/guest.ts
var STORE_FALLBACK_URL = "https://nieta.volctrack.com/a/GQTYqugN";
var SCHEME_TIMEOUT_MS = 2e3;
var ALLOWED_ROUTES = /* @__PURE__ */ new Set([
  "/tag",
  "/topic",
  "/activity",
  "/ranking",
  "/collection/interaction",
  "/oc",
  "/user",
  "/generate"
]);
function isSuckBrowser() {
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger|qq\//.test(ua);
}
function buildQuery(query) {
  if (!query || Object.keys(query).length === 0)
    return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    params.set(k, String(v));
  }
  return params.toString();
}
var GuestOpenAppImpl = class {
  openApp(route, query) {
    if (!ALLOWED_ROUTES.has(route)) {
      throw new Error(`[topic-sdk] route '${route}' is not in AllowedRoute whitelist`);
    }
    if (isSuckBrowser()) {
      this._showSuckBrowserGuide();
      return;
    }
    const qs = buildQuery(query);
    const schemeUrl = qs ? `nieta://app${route}?${qs}` : `nieta://app${route}`;
    let fallen = false;
    const timer = setTimeout(() => {
      if (fallen)
        return;
      fallen = true;
      window.location.href = STORE_FALLBACK_URL;
    }, SCHEME_TIMEOUT_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        fallen = true;
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.location.href = schemeUrl;
  }
  _showSuckBrowserGuide() {
    const message = "\u8BF7\u5728\u7CFB\u7EDF\u6D4F\u89C8\u5668\uFF08Safari / Chrome\uFF09\u4E2D\u6253\u5F00\u672C\u9875\u9762\uFF0C\u518D\u70B9\u51FB\u300C\u6253\u5F00 App\u300D\u3002\u5FAE\u4FE1/QQ \u5185\u7F6E\u6D4F\u89C8\u5668\u65E0\u6CD5\u76F4\u63A5\u5524\u8D77 App\u3002";
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
  }
};

// src/nav.ts
var SELF_PARAM_FROM_URL = {
  "/topic": { param: "hashtag", urlKey: "hashtag" },
  "/tag": { param: "hashtag", urlKey: "hashtag" },
  "/activity": { param: "uuid", urlKey: "activity_uuid" }
};
var REQUIRED_PARAMS = {
  "/oc": ["uuid"],
  "/user": ["uuid"],
  "/collection/interaction": ["uuid"]
};
var isBlank = (v) => v === void 0 || v === null || v === "";
var SDKNavImpl = class {
  constructor(_bridge, _context) {
    this._bridge = _bridge;
    this._context = _context;
    this._guestOpenApp = new GuestOpenAppImpl();
  }
  /**
   * 解析最终 query：自指路由缺参从 URL 自动填；per-item 路由缺必需参数则抛错（开发期就被打回，而非线上白屏）。
   */
  _resolveQuery(route, query) {
    const q = { ...query ?? {} };
    const selfRef = SELF_PARAM_FROM_URL[route];
    if (selfRef && isBlank(q[selfRef.param]) && typeof window !== "undefined") {
      const fromUrl = new URLSearchParams(window.location.search).get(selfRef.urlKey);
      if (fromUrl)
        q[selfRef.param] = fromUrl;
    }
    const required = REQUIRED_PARAMS[route] ?? (selfRef ? [selfRef.param] : []);
    for (const p of required) {
      if (isBlank(q[p])) {
        const hint = selfRef ? `\u8BE5\u81EA\u6307\u8DEF\u7531\u901A\u5E38\u7531 SDK \u4ECE\u5F53\u524D\u9875 ?${selfRef.urlKey}= \u81EA\u52A8\u586B\uFF0C\u4F46\u5F53\u524D URL \u6CA1\u6709\u8BE5\u503C` : `\u8BE5\u8DEF\u7531\u6307\u5411\u5177\u4F53\u5B9E\u4F53\uFF0C\u8BF7\u4ECE\u88AB\u70B9\u5361\u7247\u6570\u636E\u4F20\u5165 ${p}\uFF08\u5982 ${p}: story.uuid\uFF09`;
        throw new Error(`[topic-sdk] nav.internal('${route}') \u7F3A\u5C11\u5FC5\u9700\u53C2\u6570 '${p}'\u3002${hint}\u3002`);
      }
    }
    return q;
  }
  async internal(route, query) {
    const effectiveQuery = this._resolveQuery(route, query);
    if (this._context === "guest") {
      this._guestOpenApp.openApp(route, effectiveQuery);
      return;
    }
    if (!this._bridge) {
      throw new UnsupportedError("nav.internal", this._context);
    }
    await this._bridge.send("nav.internal", { route, query: effectiveQuery });
  }
  async external(url) {
    if (this._context === "guest") {
      window.open(url, "_blank");
      return;
    }
    if (!this._bridge) {
      throw new UnsupportedError("nav.external", this._context);
    }
    await this._bridge.send("nav.external", { url });
  }
};

// src/ui.ts
var SDKUiImpl = class {
  constructor(_bridge, _context) {
    this._bridge = _bridge;
    this._context = _context;
  }
  async toast(text, options) {
    if (this._context === "guest" || !this._bridge) {
      throw new UnsupportedError("ui.toast", this._context);
    }
    await this._bridge.send("ui.toast", {
      text,
      duration: options?.duration,
      level: options?.level ?? "info"
    });
  }
  async viewport() {
    if (this._context === "guest" || !this._bridge) {
      throw new UnsupportedError("ui.viewport", this._context);
    }
    const raw = await this._bridge.send("ui.viewport");
    return {
      safeTop: 0,
      safeBottom: raw.safeBottom ?? 0,
      keyboardInset: raw.keyboardInset ?? 0,
      width: raw.width ?? window.innerWidth,
      height: raw.height ?? window.innerHeight
    };
  }
};

// src/index.ts
var SDK_VERSION = "0.1.0";
function installLinkInterceptor(nav) {
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const targetEl = e.target instanceof Element ? e.target : e.target?.parentElement ?? null;
    const a = targetEl?.closest("a");
    if (!a)
      return;
    const href = a.getAttribute("href");
    if (!href)
      return;
    const target = a.getAttribute("target");
    if (target && target !== "_self")
      return;
    if (a.hasAttribute("download"))
      return;
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return;
    if (url.origin === location.origin) {
      if (url.pathname === location.pathname && url.search === location.search && url.hash)
        return;
      const query = {};
      url.searchParams.forEach((v, k) => {
        query[k] = v;
      });
      e.preventDefault();
      nav.internal(url.pathname, query).catch(() => {
      });
      return;
    }
    e.preventDefault();
    nav.external(url.href).catch(() => {
    });
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
function installPushStateGuard() {
  if (typeof history === "undefined")
    return () => {
    };
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  const guard = (method) => () => {
    const msg = `[topic-sdk] \u5185\u5D4C\u9875\u7981\u6B62 history.${method}(\u4F1A\u6C61\u67D3 App \u8FD4\u56DE\u6808);\u8BF7\u6539\u7528 hash \u8DEF\u7531(location.hash)\u6216\u5185\u5B58\u8DEF\u7531\u505A\u9875\u9762\u5185\u89C6\u56FE\u5207\u6362\u3002`;
    console.error(msg);
    throw new Error(msg);
  };
  history.pushState = guard("pushState");
  history.replaceState = guard("replaceState");
  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}
async function createTopicSDK(options = {}) {
  const {
    apiBaseUrl = "https://pre.api.talesofai.cn",
    helloTimeout = 1500,
    tokenTimeout = 3e3,
    tokenRefreshEarlyMs = 5 * 60 * 1e3,
    onAuthLost
  } = options;
  let effectiveTokenTimeout = tokenTimeout;
  if (effectiveTokenTimeout < 1e3) {
    console.warn(
      `[topic-sdk] tokenTimeout ${effectiveTokenTimeout}ms \u4F4E\u4E8E\u4E0B\u9650 1000ms(500ms \u662F v1 bridge \u5DF2\u77E5\u574F\u503C),\u5DF2\u4E0A\u8C03\u5230 1000ms\u3002`
    );
    effectiveTokenTimeout = 1e3;
  }
  const bridge = new BridgeClient(effectiveTokenTimeout);
  const env = await detectEnv(bridge, SDK_VERSION, helloTimeout);
  const removePushStateGuard = env.embedded ? installPushStateGuard() : () => {
  };
  const activeBridge = env.context === "guest" ? null : bridge;
  if (env.context === "guest") {
    bridge.destroy();
  }
  const auth = new SDKAuthImpl(activeBridge, effectiveTokenTimeout, tokenRefreshEarlyMs, onAuthLost);
  await auth.init();
  const capabilities = buildCapabilities(env);
  const eventsImpl = new SDKEventsImpl(activeBridge);
  if (activeBridge) {
    activeBridge.onEvent("tokenChanged", (_data) => {
      auth.handleTokenChanged().then(() => eventsImpl.notifyTokenChanged(auth.getToken())).catch(() => eventsImpl.notifyTokenChanged(null));
    });
  }
  const topicImpl = new SDKTopicImpl(apiBaseUrl, auth);
  const activityImpl = new SDKActivityImpl(apiBaseUrl, auth);
  const rankImpl = new SDKRankImpl(apiBaseUrl, auth);
  const navImpl = new SDKNavImpl(activeBridge, env.context);
  const uiImpl = new SDKUiImpl(activeBridge, env.context);
  const removeLinkInterceptor = installLinkInterceptor(navImpl);
  const sdk = {
    env: {
      context: env.context,
      embedded: env.embedded,
      client: env.client,
      appVersion: env.appVersion,
      features: env.features
    },
    auth,
    topic: topicImpl,
    activity: activityImpl,
    rank: rankImpl,
    nav: navImpl,
    ui: uiImpl,
    events: eventsImpl,
    can(cap) {
      return capabilities.has(cap);
    },
    destroy() {
      removeLinkInterceptor();
      removePushStateGuard();
      auth.destroy();
      eventsImpl.destroy();
      activeBridge?.destroy();
    }
  };
  return sdk;
}
export {
  BridgeClient,
  BridgeError,
  Capability,
  PageCursor,
  TopicApiError,
  UnsupportedError,
  createTopicSDK
};
//# sourceMappingURL=index.js.map