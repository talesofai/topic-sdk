import type { BridgeClient } from "./bridge.js";
import { UnsupportedError } from "./errors.js";
import type { ClientContext, HelloResult } from "./types.js";
import { Capability } from "./types.js";

export interface EnvResult {
  context: ClientContext;
  embedded: boolean;
  client: "ios" | "android" | "web" | "unknown";
  appVersion: string | null;
  features: string[];
  hello: HelloResult | null;
  /** 宿主注入的 ?activity_uuid=（无则 null）。决定 ReadActivity 能力是否授予（纯 hashtag 话题无活动数据）。 */
  activityUuid: string | null;
}

export async function detectEnv(bridge: BridgeClient, sdkVersion: string, helloTimeout: number): Promise<EnvResult> {
  const ua = navigator.userAgent;
  // 宿主把绑定的 activity_uuid 作为 query 注入 iframe（无则纯 hashtag 话题）。
  const activityUuid =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("activity_uuid") || null : null;

  // UA 预判：小程序直接出局
  if (/miniProgram/i.test(ua)) {
    throw new UnsupportedError("weapp-not-supported", "guest" as ClientContext);
  }

  // hello 握手（超时→ null = guest）
  const hello = await bridge.hello(sdkVersion, helloTimeout);

  if (!hello) {
    // 握手超时 → guest
    return {
      context: "guest",
      embedded: false,
      client: "unknown",
      appVersion: null,
      features: [],
      hello: null,
      activityUuid,
    };
  }

  // 宿主回包确认客户端类型（最终以握手结果为准，UA 仅用于 miniProgram 预判出局）
  const context: ClientContext = hello.client === "ios" || hello.client === "android" ? "app" : "web-embedded";

  return {
    context,
    embedded: true,
    client: hello.client,
    appVersion: hello.appVersion,
    features: hello.features,
    hello,
    activityUuid,
  };
}

/**
 * 根据 EnvResult 计算支持的 Capability 集合。
 */
export function buildCapabilities(env: EnvResult): Set<Capability> {
  const caps = new Set<Capability>();

  // 数据能力：所有上下文均支持
  caps.add(Capability.ReadTopic);
  caps.add(Capability.ReadStories);
  caps.add(Capability.ReadCharacters);
  caps.add(Capability.ReadCampaigns);
  caps.add(Capability.ReadLoreEvents);
  caps.add(Capability.ReadRank);
  // ReadActivity 仅当话题绑定了 activity（宿主注入 ?activity_uuid=）才授予；纯 hashtag 话题无活动数据，
  // 不报 ReadActivity，避免 can(ReadActivity) 恒 true 误导创作者渲染空活动区块。
  if (env.activityUuid) {
    caps.add(Capability.ReadActivity);
  }

  if (env.context !== "guest") {
    // 桥接能力（仅 App/Web-embedded）
    caps.add(Capability.Bridge);
    caps.add(Capability.NavInternal);
    caps.add(Capability.NavExternal);
    caps.add(Capability.NavApplyHost);
    caps.add(Capability.Toast);
    caps.add(Capability.Viewport);
    caps.add(Capability.EventBack);
    caps.add(Capability.EventTokenChanged);
    caps.add(Capability.EventViewport);
  }
  // guest（仅本地 dev 无宿主可达）：仅只读数据能力；唤起 App 统一靠宿主 nav.internal，不再暴露独立 OpenApp 能力。

  return caps;
}
