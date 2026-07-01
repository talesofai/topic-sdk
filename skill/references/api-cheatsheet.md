# @talesofai/topic-sdk API 速查（与已部署后端对齐）

> 真相源：SDK `src/types.ts` 导出类型 + 后端 `/v1/embed/*`。本表是离线契约副本；若与 SDK 实际导出不符，以 SDK 为准并报告差异。

## 初始化

```ts
import { createTopicSDK } from '@talesofai/topic-sdk';

const sdk = await createTopicSDK({
  apiBaseUrl?: string,         // 默认 'https://pre.api.talesofai.cn'（pre 测期间临时默认，上线前回退）
  helloTimeout?: number,       // hello 握手超时 ms，默认 1500
  tokenTimeout?: number,       // getEmbedToken 超时 ms，默认 3000（勿设 500）
  tokenRefreshEarlyMs?: number,// 过期前多久重取，默认 5*60*1000
  onAuthLost?: (reason: string) => void, // token 不可恢复时回调（只做匿名降级）
});
```

## 顶层对象

| 成员 | 说明 |
|---|---|
| `sdk.env` | `{ context: 'app'\|'web-embedded'\|'guest', embedded: boolean, client: 'ios'\|'android'\|'web'\|'unknown', appVersion: string\|null, features: string[] }`（属性，初始化后同步可读） |
| `sdk.can(cap)` | 某能力在当前上下文是否支持（`Capability` 枚举） |
| `sdk.auth` | `getToken(): string\|null` / `getExpiresAt(): number\|null` / `isAuthenticated(): boolean` |
| `sdk.topic` | 话题只读数据 |
| `sdk.activity` | 活动 tab / 精选 |
| `sdk.rank` | 榜单 |
| `sdk.nav` | `internal(route, query?)` / `external(url)` / `applyHost()` |
| `sdk.ui` | `toast(text, opts?)` / `viewport()` |
| `sdk.events` | `on('tokenChanged'\|'viewport'\|'back', cb)` / `off(...)` |
| `sdk.destroy()` | 释放 |

> 没有 `sdk.guest.openApp` / 写动作 API。唤起 App 由宿主承载——一律用 `sdk.nav.internal`（手机浏览器宿主会自动唤起 App，见下）。

## 数据方法

```ts
sdk.topic.getDetail(name): Promise<TopicDetail>
sdk.topic.listStories(name, { pageIndex, pageSize, sort, startTime?, endTime?, authorUuid? }): Promise<Page<StoryCard>>
  // sort: 'hot' | 'like_count' | 'highlight_mark_time'
  // startTime?: number / endTime?: number（UTC ms）：可选时间窗，透传后端 start_time/end_time。
  //   ⚠ 后端仅当两端都传时才下推为窗口（ms→秒）；单边提供按"未提供"忽略（保持全量语义）。
  // authorUuid?: string：可选作者过滤。authorUuid 解析不到（不存在/拼错）→ 后端返回空 Page，不退化成全量。
sdk.topic.listMyStories(name, { kind, pageIndex?, pageSize? }): Promise<Page<StoryCard>>
  // kind: 'favored'（我收藏的本话题作品）| 'created'（我投稿的）| 'liked'（我点赞的）
  // 鉴权来自 embed token：匿名（无 embed token）返回空 Page（total=0、list=[]、hasNext=false），不抛错、不 401。
  // pageIndex/pageSize 可选（后端默认 pageIndex=0、pageSize=20、kind 默认 created）。
sdk.topic.listCharacters(name, { parentType?: string[], pageIndex, pageSize, sort? }): Promise<Page<CharacterCard>>
  // parentType 省略 → 后端默认 ['oc','elementum']
sdk.topic.listCampaigns(name, { pageIndex, pageSize }): Promise<Page<CampaignCard>>
sdk.topic.listLoreEvents(name): Promise<LoreEvent[]>
sdk.topic.listHot(name): Promise<HotStoryCard[]>
  // 话题算法热门流（bounded 热门列表，无分页）；每条 = StoryCard 全字段 + hotScore:number
sdk.topic.getWeeklyHottest(name): Promise<WeeklyHottest | null>
  // 本周最热单品（近 7 天同款 UV 最高一条）；无则 null

sdk.activity.listTabs(uuid): Promise<TopicTab[]>
sdk.activity.listSelectedStories(uuid, tabKey, { pageIndex, pageSize, sort? }): Promise<HighlightPage>
  // HighlightPage.topList 仅 pageIndex=0 时非空

sdk.rank.get(entity, window, at): Promise<Leaderboard<StoryCard|CreatorCard|CharacterCard>>
  // entity: 'stories' | 'creators' | 'oc' | 'elementum'（facade 内部映射数据源）
  // window: 'daily' | 'weekly' | 'monthly'
  // at: number(UTC ms) | 'latest'
  // ⚠ 'oc'/'elementum' 只支持 at='latest'，传时间戳会抛 TopicApiError(400)
```

## 关键契约（**可空字段，必须判空**）

```ts
interface Page<T> { total: number; pageIndex: number; pageSize: number; list: T[]; hasNext: boolean; }

interface TopicDetail {
  hashtagName: string;
  kind: 'hashtag' | 'activity';
  activityUuid: string | null;
  title: string | null;
  description: RichText | null;   // { contentType: 'text'|'html'|'markdown'; content: string }
  bannerPic: string | null; smallBannerPic: string | null; headerPic: string | null;
  phase: 'draft'|'preparing'|'running'|'ended' | null;
  startTime: number | null;       // UTC ms ← 可空
  endTime: number | null;         // UTC ms ← 可空
  heat: number; participantsCount: number; subscribeCount: number;
  action: { visible: boolean; label: string | null; url: string | null } | null;
  tabs: TopicTab[];               // { key, label, visible }
  ruleStoryUuid: string | null;
  viewer: { subscribed: boolean; canEdit: boolean } | null;  // 匿名为 null；无 hasReviewPermission
}

interface StoryCard {
  storyId: string;
  title: string | null; coverUrl: string | null; shareUrl: string | null;
  aspect: string | null;          // ← 可空
  author: { uuid: string | null; nickName: string | null; avatarUrl: string | null };  // uuid 可空
  metrics: { likeCount: number; sameStyleCount: number; picCount: number };
  flags: { hasVideo: boolean; hasBgm: boolean; isInteractive: boolean; isPinned: boolean };
  hashtagNames: string[];
  viewer: { liked: boolean; favored: boolean } | null;  // 匿名为 null
}

interface CharacterCard {
  uuid: string; name: string | null; coverUrl: string | null;
  type: 'oc' | 'elementum' | string;
  author: { uuid: string | null; nickName: string | null; avatarUrl: string | null };  // uuid 可空
}

interface CampaignCard { uuid: string; title: string | null; coverUrl: string | null; pv: number; }

interface LoreEvent {
  uuid: string; name: string; category: string | null; description: string | null;
  sortIndex: number; collectionCount: number;
  boundTopic: { name: string; startTime: number | null; endTime: number | null } | null;
  stories: StoryCard[];
}

interface HighlightPage extends Page<StoryCard & { highlightTime: number | null }> {
  topList: StoryCard[];           // 仅 pageIndex=0 非空
}

interface HotStoryCard extends StoryCard {
  hotScore: number;               // 热度分（后端 doc.sort[0]*1000 取整），int
}

interface WeeklyHottest {         // getWeeklyHottest 可空：无近 7 天最热则整体为 null
  collectionUuid: string;
  title: string;
  coverUrl: string | null;        // ← 可空
  sameStyleUv: number;
  creatorName: string;
  creatorUuid: string;
  creatorAvatar: string | null;   // ← 可空
  isInteractive: boolean;
}

interface Leaderboard<T> {
  window: 'daily'|'weekly'|'monthly';
  entity: 'stories'|'creators'|'oc'|'elementum';
  startTime: number | null;       // ← 可空
  endTime: number | null;         // ← 可空
  lastUpdatedAt: number | null;
  list: { rank: number; score: number; item: T }[];  // score 已乘 multiplier 取整
}

interface CreatorCard {
  uuid: string | null;            // ← 可空
  nickName: string | null; avatarUrl: string | null;
  subscriberCount: number; storyCount: number; topStories: StoryCard[];
}
```

## 导航 — AllowedRoute v1 白名单

`sdk.nav.internal(route, query?)` 的 route 必须 ∈下表。**参数契约按路由性质分两类，传错/漏传会被 SDK 拦下（构建期类型 + 运行期 throw），不会再静默白屏**：

| route | 含义 | 必需参数 | 谁来填 |
|---|---|---|---|
| `/topic` | 话题聚合 | `hashtag` | **自指**：省略则 SDK 从当前页 `?hashtag=` 自动填，可覆盖 |
| `/tag` | 话题页 | `hashtag` | **自指**：同上自动填 |
| `/activity` | 活动详情 | `uuid` | **自指**：省略则 SDK 从当前页 `?activity_uuid=` 自动填（宿主已注入），可覆盖 |
| `/ranking` | 榜单 | 无 | — |
| `/generate` | 去创作 | 无 | — |
| `/collection/interaction` | 作品详情（含查看/写交互入口） | `uuid` | **per-item**：必传，来自被点卡片（如 `{ uuid: story.storyId }`） |
| `/oc` | 角色/OC | `uuid` | **per-item**：必传（如 `{ uuid: character.uuid }`） |
| `/user` | 用户主页（青少年模式受限） | `uuid` | **per-item**：必传（如 `{ uuid: creator.uuid }`） |

> **自指 vs per-item**：参数=「当前这个话题/活动」→ 自指，可省（SDK 自动填）；参数=「具体某个角色/用户/作品」→ per-item，必传（SDK 无从代填，漏传直接抛错）。
>
> 示例：`sdk.nav.internal('/topic')`（自动填当前话题）；`sdk.nav.internal('/oc', { uuid: c.uuid })`（必传）。
>
> **跳到另一个话题活动空间**：自指参数**显式传值即覆盖自动填充**，故跳别的话题直接 `sdk.nav.internal('/tag', { hashtag: '另一个话题名' })` 即可（同理 `/activity` 传别的 `uuid`）——目标从哪来（写死 / 页面自己的数据源）由你决定，SDK 不提供"相关话题列表"这类数据源。

不放行（宿主会拒）：`/collection/publish`、`/picture-selector`、`/webview`。

> SDK 做运行期白名单校验（非白名单 route 抛错）。`guest` 上下文（仅本地 dev 无宿主可达）下 `nav.internal` 内部转深链；生产入口恒为宿主内嵌，手机浏览器宿主会自动唤起 App。

## 申请创建话题活动空间 — `sdk.nav.applyHost()`

- **不接受参数**：跳转到运营配置的申请表单（飞书多维表单），prefill 的当前话题名 / 用户昵称 / 用户 UID **全由宿主本地态直接拼**，页面/SDK 拿不到这些字段、也不经手（与 `getEmbedToken` 不下发宿主 token 同一不变量）。
- 运营未配置申请表单 URL 时，宿主报 `not-configured`，SDK 侧表现为 `BridgeError`（`code: 'rejected'`）——**建议包一层 try/catch，未配置时不渲染入口或降级隐藏**，不要假设恒可用。
- `guest` 上下文（仅本地 dev 无宿主可达）：本地不跳转，仅 console 提示；生产入口恒为宿主内嵌。

```ts
try {
  await sdk.nav.applyHost();
} catch {
  // 未配置申请表单 / bridge 异常：隐藏这个入口即可，不必给用户报错
}
```

## 鉴权 / token 模型

- embed token = **7 天无状态 JWT**（`token_type='embed'`，不可吊销，残留风险已知接受）。
- 数据端点：embed token 无效/过期时**降级匿名返 200**（`viewer=null`），**不返回 401**。
- re-exchange 由 **expiresAt 临近过期 + `tokenChanged` 事件**驱动（SDK 内部自动），不由数据请求 401 触发。
- 宿主 `getEmbedToken` bridge 回包 = `{ embedToken, expiresAt }`（对齐后端 `EmbedTokenResponse.embedToken`）。
- `sdk.events.on('tokenChanged', cb)`：SDK 内部重取后把**新 token** 回调给你（宿主事件本身不携带 token）。

## frame-bridge v2 协议（SDK 已封装，正常无需手写）

```
请求 (iframe→host):  { v:2, id, method, params? }
响应 (host→iframe):  { v:2, id, ok:true, result } | { v:2, id, ok:false, error:{code,message} }
事件 (host→iframe):  { v:2, event, data }
```

## 错误类型

- `TopicApiError(statusCode, message, endpoint, cause?)` — HTTP/网络/解析错误（statusCode -1 = 网络/解析）。
- `BridgeError(code, method, requestId, cause?)` — bridge 通信（timeout/rejected/...）。
- `UnsupportedError(capability, context)` — 当前上下文不支持的能力（不静默 no-op）。

## 发布 / 上传大小限制

`scripts/deploy.mjs` 上传前本地预检（早于上传 fail）：

- 单文件 **≤ 10MB**；任一文件超限直接打回。
- `dist/` 所有文件**总和 ≤ 100MB**；超限直接打回。

> 常量与后端一致；grant 下发的 `max_file_size` 仍单独校验，二者取更严者。
