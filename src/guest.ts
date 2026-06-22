import type { AllowedRoute, GuestOpenApp } from "./types.js";

const STORE_FALLBACK_URL = "https://nieta.volctrack.com/a/GQTYqugN";
const SCHEME_TIMEOUT_MS = 2000;

/** AllowedRoute v1 运行期白名单（与 types.ts AllowedRoute 类型保持一致；防消费方 `as` 强转绕过编译期约束） */
const ALLOWED_ROUTES: ReadonlySet<string> = new Set([
  "/tag",
  "/topic",
  "/activity",
  "/ranking",
  "/collection/interaction",
  "/oc",
  "/user",
  "/generate",
]);

/** 检测微信、QQ 等无法直接唤起 scheme 的内置浏览器 */
function isSuckBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger|qq\//.test(ua);
}

function buildQuery(query?: Record<string, string | number>): string {
  if (!query || Object.keys(query).length === 0) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    params.set(k, String(v));
  }
  return params.toString();
}

export class GuestOpenAppImpl implements GuestOpenApp {
  public openApp(route: AllowedRoute, query?: Record<string, string | number>): void {
    // 运行期白名单校验（防消费方用 `as AllowedRoute` 强转注入任意 scheme path）
    if (!ALLOWED_ROUTES.has(route)) {
      throw new Error(`[topic-sdk] route '${route}' is not in AllowedRoute whitelist`);
    }

    if (isSuckBrowser()) {
      // 微信/QQ 内置浏览器无法直接唤起 scheme
      // 引导用户在外部浏览器中打开
      this._showSuckBrowserGuide();
      return;
    }

    const qs = buildQuery(query);
    const schemeUrl = qs ? `nieta://app${route}?${qs}` : `nieta://app${route}`;

    // 2s 后未跳转 → 跳应用商店兜底
    let fallen = false;
    const timer = setTimeout(() => {
      if (fallen) return;
      fallen = true;
      window.location.href = STORE_FALLBACK_URL;
    }, SCHEME_TIMEOUT_MS);

    // visibilitychange：页面隐藏说明已进入 App，清除计时器
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

  private _showSuckBrowserGuide(): void {
    // SDK 不依赖 DOM 框架，用原生 alert 作为最低限度可见反馈（避免静默无反应）。
    // 本类仅在 guest 上下文（本地 dev 无宿主）由 nav.internal 内部调用；生产入口恒为宿主内嵌，由宿主承载更友好的引导 UI。
    const message = "请在系统浏览器（Safari / Chrome）中打开本页面，再点击「打开 App」。微信/QQ 内置浏览器无法直接唤起 App。";
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
  }
}
