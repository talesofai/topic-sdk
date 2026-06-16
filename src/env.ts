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
}

export async function detectEnv(bridge: BridgeClient, sdkVersion: string, helloTimeout: number): Promise<EnvResult> {
  const ua = navigator.userAgent;

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
  caps.add(Capability.ReadActivity);
  caps.add(Capability.ReadRank);

  if (env.context !== "guest") {
    // 桥接能力（仅 App/Web-embedded）
    caps.add(Capability.Bridge);
    caps.add(Capability.NavInternal);
    caps.add(Capability.NavExternal);
    caps.add(Capability.Toast);
    caps.add(Capability.Viewport);
    caps.add(Capability.EventBack);
    caps.add(Capability.EventTokenChanged);
    caps.add(Capability.EventViewport);
  } else {
    // 游客唤起
    caps.add(Capability.OpenApp);
  }

  return caps;
}
