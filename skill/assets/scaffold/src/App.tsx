import { useEffect, useState } from "react";
import { TopicApiError, type StoryCard, type TopicDetail, type TopicSDK } from "@talesofai/topic-sdk";
import { getHashtag, getSdk } from "./sdk";

export function App() {
  const [sdk, setSdk] = useState<TopicSDK | null>(null);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [stories, setStories] = useState<StoryCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hashtag = getHashtag();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getSdk();
        if (cancelled) return;
        setSdk(s);
        if (!hashtag) {
          setError("缺少 hashtag 参数");
          return;
        }
        // 只读数据：匿名/游客也能拉（viewer 字段会是 null）
        const [d, page] = await Promise.all([
          s.topic.getDetail(hashtag),
          s.topic.listStories(hashtag, { pageIndex: 0, pageSize: 20, sort: "hot" }),
        ]);
        if (cancelled) return;
        setDetail(d);
        setStories(page.list);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof TopicApiError ? `${e.statusCode} ${e.message}` : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hashtag]);

  if (error) return <div style={{ padding: 16 }}>加载失败：{error}</div>;
  if (!sdk || !detail) return <div style={{ padding: 16 }}>加载中…</div>;

  const isGuest = !sdk.env.embedded;

  // per-item 写（点赞/收藏/查看）→ 跳原生作品详情页完成，页面不自绘写按钮
  const openStory = (story: StoryCard) => {
    void sdk.nav.internal("/collection/interaction", { uuid: story.storyId }).catch(() => {});
  };

  // 页面级写意图：统一走 nav.internal（hashtag 由 SDK 自动填）。
  // 游客（仅本地 dev 无宿主）内部转唤起 App；嵌入态由宿主承载（手机浏览器唤起 App / 站内跳；登录分享走宿主固定浮层，D9）。
  const onWriteIntent = () => {
    if (isGuest) {
      void sdk.nav.internal("/tag").catch(() => {});
    } else {
      void sdk.ui.toast("请使用顶部的分享 / 登录入口", { level: "info" }).catch(() => {});
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <header>
        <h1>{detail.title ?? detail.hashtagName}</h1>
        <p style={{ color: "#888", fontSize: 12 }}>
          上下文：{sdk.env.context}
          {/* startTime 可空 → 判空再用 */}
          {detail.startTime != null && ` · 开始：${new Date(detail.startTime).toLocaleDateString()}`}
        </p>
      </header>

      <section style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {stories.map((s) => (
          <button
            key={s.storyId}
            onClick={() => openStory(s)}
            style={{ textAlign: "left", border: "1px solid #eee", borderRadius: 8, padding: 8, background: "#fff" }}
          >
            {s.coverUrl && (
              <img
                src={s.coverUrl}
                alt={s.title ?? ""}
                // aspect 可空 → 兜底
                style={{ width: "100%", aspectRatio: s.aspect ?? "1 / 1", objectFit: "cover", borderRadius: 6 }}
              />
            )}
            <div>{s.title ?? "未命名作品"}</div>
            {/* author.uuid / nickName 可空 → 判空再展示 */}
            <div style={{ fontSize: 12, color: "#888" }}>
              {s.author.nickName ?? "匿名作者"} · ❤ {s.metrics.likeCount}
            </div>
          </button>
        ))}
      </section>

      <button onClick={onWriteIntent} style={{ marginTop: 16 }}>
        {isGuest ? "打开 App 参与" : "分享 / 登录（宿主浮层）"}
      </button>
    </div>
  );
}
