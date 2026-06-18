import { SDKAuthImpl } from "./auth.js";
import { BridgeClient } from "./bridge.js";
import { SDKActivityImpl, SDKRankImpl, SDKTopicImpl } from "./data.js";
import { buildCapabilities, detectEnv } from "./env.js";
import { SDKEventsImpl } from "./events.js";
import { GuestOpenAppImpl } from "./guest.js";
import { SDKNavImpl } from "./nav.js";
import type { Capability, SDKAuth, TopicSDK, TopicSDKOptions } from "./types.js";
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
  GuestOpenApp,
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

  // ① + ② 端探测 + hello 握手
  // BridgeClient は常に作成するが、guest の場合はすぐ破棄する
  const bridge = new BridgeClient(tokenTimeout);
  const env = await detectEnv(bridge, SDK_VERSION, helloTimeout);

  // guest の場合は bridge を使わない
  const activeBridge = env.context === "guest" ? null : bridge;
  if (env.context === "guest") {
    // guest 模式：bridge 不再需要，但保留 message listener 无害（destroy 可选）
    // 为节约资源，立即销毁
    bridge.destroy();
  }

  // ③ 鉴权
  const auth = new SDKAuthImpl(activeBridge, tokenTimeout, tokenRefreshEarlyMs, onAuthLost);
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
  const guestImpl = new GuestOpenAppImpl();

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
    guest: guestImpl,

    can(cap: Capability): boolean {
      return capabilities.has(cap);
    },

    destroy(): void {
      auth.destroy();
      eventsImpl.destroy();
      activeBridge?.destroy();
    },
  };

  return sdk;
}
