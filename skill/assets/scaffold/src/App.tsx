import { useEffect, useState } from "react";
import { TopicApiError, type StoryCard, type TopicDetail, type TopicSDK } from "@talesofai/topic-sdk";
import { getHashtag, getSdk } from "./sdk";

/**
 * 页面骨架 = 只渲染「可滚动内容区」(标题块 + 卡片/列表)。这是干净正例,照它的形状长。
 *
 * 宿主顶栏 / 固定浮层【已提供】:返回 / 分享 / 主页(回内嵌页首页) / 开发者菜单 / 登录 / 举报,
 * 底部安全区也由宿主处理 —— 页面【绝不】自绘这些(D9),自绘会与宿主重复 / 冲突:
 *   ✗ 不画顶栏 / 固定头 / `position: fixed|sticky` 顶部条
 *   ✗ 不画 返回 / 分享 / 主页 / 登录 / 举报 按钮
 *   ✗ 不加 safeTop / `env(safe-area-inset-*)` 内边距(`sdk.ui.viewport().safeTop` 恒为 0)
 *
 * 页面唯一正确的写意图出口:per-item 点卡 → `sdk.nav.internal` 跳原生页(见下方 openStory)。
 * 不要把这个出口扩成"顶栏返回 / 分享 / 主页"按钮。
 */
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

  // per-item 写（点赞/收藏/查看）→ 跳原生作品详情页完成，页面不自绘写按钮。
  // 这是页面唯一该有的写意图出口；【不要】把它扩成顶栏的 返回/分享/主页 按钮（D9）。
  const openStory = (story: StoryCard) => {
    void sdk.nav.internal("/collection/interaction", { uuid: story.storyId }).catch(() => {});
  };

  return (
    <div style={{ padding: 16 }}>
      {/* 内容区第一块（标题），不是顶栏。宿主已提供 返回/分享/主页，
          这里【不要】加 position:sticky/fixed，也【不要】放 返回/分享 图标按钮（D9）。 */}
      <div>
        <h1>{detail.title ?? detail.hashtagName}</h1>
        <p style={{ color: "#888", fontSize: 12 }}>
          上下文：{sdk.env.context}
          {/* startTime 可空 → 判空再用 */}
          {detail.startTime != null && ` · 开始：${new Date(detail.startTime).toLocaleDateString()}`}
        </p>
      </div>

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
    </div>
  );
}
