import { createTopicSDK, type TopicSDK } from "@talesofai/topic-sdk";

let _sdkPromise: Promise<TopicSDK> | null = null;

/** 单例初始化 SDK。createTopicSDK 内部完成端探测/hello/鉴权/能力协商/事件订阅。 */
export function getSdk(): Promise<TopicSDK> {
  if (!_sdkPromise) {
    _sdkPromise = createTopicSDK({
      tokenTimeout: 3000, // 默认 3000，勿设 500（v1 bridge 历史坏值）
      onAuthLost: (reason) => {
        // token 不可恢复时：只做匿名降级 + 日志，不抛错、不阻塞渲染
        console.warn("[topic-page] auth lost, anonymous fallback:", reason);
      },
    });
  }
  return _sdkPromise;
}

/** 话题名：宿主把 hashtag 作为 query 传给 iframe src（对外 URL 仍是 app.nieta.art/tag?hashtag=X）。 */
export function getHashtag(): string {
  return new URLSearchParams(window.location.search).get("hashtag") ?? "";
}
