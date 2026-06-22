import { SDKAuthImpl } from "./auth.js";
import { BridgeClient } from "./bridge.js";
import { SDKActivityImpl, SDKRankImpl, SDKTopicImpl } from "./data.js";
import { buildCapabilities, detectEnv } from "./env.js";
import { SDKEventsImpl } from "./events.js";
import { SDKNavImpl } from "./nav.js";
import type { AllowedRoute, Capability, SDKAuth, TopicSDK, TopicSDKOptions } from "./types.js";
import { SDKUiImpl } from "./ui.js";

export type {
  AllowedRoute,
  BridgeClient as BridgeClientType,
  // 活动
  CampaignCard,
  // 角色
  CharacterCard,
  // 环境/能力
  ClientContext,
  CreatorCard,
  HelloResult,
  HighlightPage,
  Leaderboard,
  // 世界观
  LoreEvent,
  // 通用
  Page,
  RankEntity,
  RankEntry,
  // 榜单
  RankWindow,
  RichText,
  SDKActivity,
  // 接口
  SDKAuth,
  SDKEvents,
  SDKNav,
  SDKRank,
  SDKTopic,
  SDKUi,
  // 作品
  StoryCard,
  TopicDetail,
  TopicSDK,
  TopicSDKOptions,
  // 话题
  TopicTab,
  ViewportInfo,
} from "./types.js";

export { BridgeClient } from "./bridge.js";
export { PageCursor } from "./data.js";
export { BridgeError, TopicApiError, UnsupportedError } from "./errors.js";
export { Capability } from "./types.js";

const SDK_VERSION = "0.1.0";

/**
 * 全局拦截 <a> 点击。内嵌页跑在 sandbox iframe(无 allow-top-navigation)里,原生 <a>/相对路径跳转会逃逸到
 * iframe 自身源(OSS)而非宿主 App。故在捕获阶段接管:
 *  - 同源路径跳转 → nav.internal(命中 AllowedRoute 由宿主导航/游客转深链;未命中被宿主拦截、不逃逸);
 *  - 跨站外链 → nav.external(宿主用系统浏览器打开);
 *  - 同 path 仅改 hash(页面内视图切换)、target=_blank、download、非 http(s) scheme → 放行。
 * 这样创作者即便写了原生链接,也不会把 iframe 跳出内嵌页。返回卸载函数。
 */
function installLinkInterceptor(nav: SDKNavImpl): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const targetEl = e.target instanceof Element ? e.target : ((e.target as Node | null)?.parentElement ?? null);
    const a = targetEl?.closest("a") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    const target = a.getAttribute("target");
    if (target && target !== "_self") return;
    if (a.hasAttribute("download")) return;
    let url: URL;
    try {
      url = new URL(href, location.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin === location.origin) {
      // 同 path 仅改 hash(页面内视图切换)→ 放行,交给页面自己处理
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        query[k] = v;
      });
      e.preventDefault();
      nav.internal(url.pathname as AllowedRoute, query).catch(() => {});
      return;
    }
    e.preventDefault();
    nav.external(url.href).catch(() => {});
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

/**
 * 守卫 history.pushState/replaceState。内嵌页禁用(会污染 Android WebView 返回栈,返回键先消费 iframe history),
 * 应改用 hash 路由 / 内存路由。embedded 下安装,违例当场 throw(dev 期即暴露);destroy 恢复原函数。
 */
function installPushStateGuard(): () => void {
  if (typeof history === "undefined") return () => {};
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  const guard = (method: string) => () => {
    const msg =
      `[topic-sdk] 内嵌页禁止 history.${method}(会污染 App 返回栈);` +
      `请改用 hash 路由(location.hash)或内存路由做页面内视图切换。`;
    console.error(msg);
    throw new Error(msg);
  };
  history.pushState = guard("pushState") as typeof history.pushState;
  history.replaceState = guard("replaceState") as typeof history.replaceState;
  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

/**
 * 初始化并返回 TopicSDK 实例。
 *
 * 初始化序列：
 * ① 端探测（UA 嗅探预判）
 * ② hello 握手（超时→ guest）
 * ③ 鉴权（embedded：bridge getEmbedToken；guest：匿名）
 * ④ 能力协商（填充 Capability 位图）
 * ⑤ 事件订阅（tokenChanged / viewport / back）
 */
export async function createTopicSDK(options: TopicSDKOptions = {}): Promise<TopicSDK> {
  const {
    apiBaseUrl = "https://pre.api.talesofai.cn",
    helloTimeout = 1500,
    tokenTimeout = 3000,
    tokenRefreshEarlyMs = 5 * 60 * 1000,
    onAuthLost,
  } = options;

  // tokenTimeout 下界 clamp:500ms 是 v1 bridge 已知坏值;低于 1000ms 上调并告警(SKILL 固定 3000)。
  let effectiveTokenTimeout = tokenTimeout;
  if (effectiveTokenTimeout < 1000) {
    console.warn(
      `[topic-sdk] tokenTimeout ${effectiveTokenTimeout}ms 低于下限 1000ms(500ms 是 v1 bridge 已知坏值),已上调到 1000ms。`,
    );
    effectiveTokenTimeout = 1000;
  }

  // ① + ② 端探测 + hello 握手
  // BridgeClient は常に作成するが、guest の場合はすぐ破棄する
  const bridge = new BridgeClient(effectiveTokenTimeout);
  const env = await detectEnv(bridge, SDK_VERSION, helloTimeout);

  // embedded 上下文:守卫 history.pushState/replaceState(内嵌页禁用,会污染 App 返回栈);违例当场 throw,dev 期即暴露。
  const removePushStateGuard = env.embedded ? installPushStateGuard() : () => {};

  // guest の場合は bridge を使わない
  const activeBridge = env.context === "guest" ? null : bridge;
  if (env.context === "guest") {
    // guest 模式：bridge 不再需要，但保留 message listener 无害（destroy 可选）
    // 为节约资源，立即销毁
    bridge.destroy();
  }

  // ③ 鉴权
  const auth = new SDKAuthImpl(activeBridge, effectiveTokenTimeout, tokenRefreshEarlyMs, onAuthLost);
  await auth.init();

  // ④ 能力协商
  const capabilities = buildCapabilities(env);

  // ⑤ 事件订阅：tokenChanged → 自动重取 token
  const eventsImpl = new SDKEventsImpl(activeBridge);

  if (activeBridge) {
    activeBridge.onEvent("tokenChanged", (_data: unknown) => {
      // 宿主事件不携带新 token（恒 null），SDK 内部 re-exchange 后再把真实 token 下发给消费方
      auth
        .handleTokenChanged()
        .then(() => eventsImpl.notifyTokenChanged(auth.getToken()))
        .catch(() => eventsImpl.notifyTokenChanged(null));
    });
  }

  // ————— 构造子模块 —————
  const topicImpl = new SDKTopicImpl(apiBaseUrl, auth as SDKAuth);
  const activityImpl = new SDKActivityImpl(apiBaseUrl, auth as SDKAuth);
  const rankImpl = new SDKRankImpl(apiBaseUrl, auth as SDKAuth);
  const navImpl = new SDKNavImpl(activeBridge, env.context);
  const uiImpl = new SDKUiImpl(activeBridge, env.context);

  // 根治"原生 <a>/相对跳转在 sandbox iframe 内逃逸到 OSS 源"的问题:全局接管 <a> 点击,改走 bridge 导航。
  const removeLinkInterceptor = installLinkInterceptor(navImpl);

  // ————— TopicSDK 对象 —————
  const sdk: TopicSDK = {
    env: {
      context: env.context,
      embedded: env.embedded,
      client: env.client,
      appVersion: env.appVersion,
      features: env.features,
    },

    auth: auth as SDKAuth,
    topic: topicImpl,
    activity: activityImpl,
    rank: rankImpl,
    nav: navImpl,
    ui: uiImpl,
    events: eventsImpl,

    can(cap: Capability): boolean {
      return capabilities.has(cap);
    },

    destroy(): void {
      removeLinkInterceptor();
      removePushStateGuard();
      auth.destroy();
      eventsImpl.destroy();
      activeBridge?.destroy();
    },
  };

  return sdk;
}
