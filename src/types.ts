// ————— 通用 —————

export interface Page<T> {
  total: number;
  pageIndex: number;
  pageSize: number;
  list: T[];
  /** facade 重算（修复 api_hashtag.py:693 bug） */
  hasNext: boolean;
}

export interface RichText {
  contentType: "text" | "html" | "markdown";
  /** html 类型必须服务端消毒（sanitize）后下发 */
  content: string;
}

// ————— 话题 —————

export interface TopicTab {
  key: string;
  label: string;
  visible: boolean;
}

export interface TopicDetail {
  hashtagName: string;
  kind: "hashtag" | "activity";
  activityUuid: string | null;
  title: string | null;
  description: RichText | null;
  bannerPic: string | null;
  smallBannerPic: string | null;
  headerPic: string | null;
  phase: "draft" | "preparing" | "running" | "ended" | null;
  startTime: number | null; // UTC ms
  endTime: number | null; // UTC ms
  /** 合并 popularity / hashtag_heat 为单字段单语义 */
  heat: number;
  participantsCount: number;
  subscribeCount: number;
  action: {
    visible: boolean;
    label: string | null;
    url: string | null;
  } | null;
  tabs: TopicTab[];
  ruleStoryUuid: string | null;
  /** 登录态填充；匿名/游客（无 embed token）为 null */
  viewer: {
    subscribed: boolean;
    canEdit: boolean;
  } | null;
}

// ————— 作品卡片 —————

export interface StoryCard {
  storyId: string;
  title: string | null;
  coverUrl: string | null;
  shareUrl: string | null;
  aspect: string | null;
  author: {
    uuid: string | null;
    nickName: string | null;
    avatarUrl: string | null;
  };
  metrics: {
    likeCount: number;
    sameStyleCount: number;
    picCount: number;
  };
  flags: {
    hasVideo: boolean;
    hasBgm: boolean;
    isInteractive: boolean;
    isPinned: boolean;
  };
  hashtagNames: string[];
  /** 匿名/游客 null */
  viewer: {
    liked: boolean;
    favored: boolean;
  } | null;
}

// ————— 话题热门流 / 本周最热 —————

/** 话题算法热门流的作品卡片：现有 StoryCard 全字段 + 热度分（已乘 1000 取整）。 */
export interface HotStoryCard extends StoryCard {
  /** 热度分（后端 doc.sort[0]*1000 取整），int。 */
  hotScore: number;
}

/** 本周最热单品（近 7 天同款 UV 最高的一条），无则 null。全 camelCase。 */
export interface WeeklyHottest {
  collectionUuid: string;
  title: string;
  coverUrl: string | null;
  sameStyleUv: number;
  creatorName: string;
  creatorUuid: string;
  creatorAvatar: string | null;
  isInteractive: boolean;
}

// ————— 活动精选 —————

export interface HighlightPage extends Page<StoryCard & { highlightTime: number | null }> {
  /** topList 仅 pageIndex=0 时非空，其余页为 [] */
  topList: StoryCard[];
}

// ————— 角色卡片 —————

export interface CharacterCard {
  uuid: string;
  name: string | null;
  coverUrl: string | null;
  type: "oc" | "elementum" | string;
  author: {
    uuid: string | null;
    nickName: string | null;
    avatarUrl: string | null;
  };
}

// ————— 活动卡片 —————

export interface CampaignCard {
  uuid: string;
  title: string | null;
  coverUrl: string | null;
  pv: number;
}

// ————— 世界观事件 —————

export interface LoreEvent {
  uuid: string;
  name: string;
  category: string | null;
  description: string | null;
  sortIndex: number;
  collectionCount: number;
  boundTopic: {
    name: string;
    startTime: number | null; // UTC ms
    endTime: number | null; // UTC ms
  } | null;
  stories: StoryCard[];
}

// ————— 榜单 —————

export type RankWindow = "daily" | "weekly" | "monthly";
export type RankEntity = "stories" | "creators" | "oc" | "elementum";

export interface Leaderboard<T> {
  window: RankWindow;
  entity: RankEntity;
  startTime: number | null; // UTC ms；后端 Optional，可能下发 null
  endTime: number | null; // UTC ms；后端 Optional，可能下发 null
  lastUpdatedAt: number | null;
  list: RankEntry<T>[];
}

export interface RankEntry<T> {
  rank: number;
  /** 经 score_multiplier 缩放后的整数 */
  score: number;
  item: T;
}

export interface CreatorCard {
  uuid: string | null;
  nickName: string | null;
  avatarUrl: string | null;
  subscriberCount: number;
  storyCount: number;
  topStories: StoryCard[];
}

// ————— 客户端上下文 —————

export type ClientContext = "app" | "web-embedded" | "guest";

/** hello 响应中的 client 字段（宿主回传具体平台） */
export type BridgeClient = "ios" | "android" | "web";

export interface HelloResult {
  /** 宿主平台 */
  client: BridgeClient;
  /** App 版本号，Web 宿主为 null */
  appVersion: string | null;
  /** 宿主支持的 bridge method 列表 */
  features: string[];
}

// ————— 能力位图 —————

export enum Capability {
  // 数据能力（所有上下文均支持）
  ReadTopic = "read.topic",
  ReadStories = "read.stories",
  ReadCharacters = "read.characters",
  ReadCampaigns = "read.campaigns",
  ReadLoreEvents = "read.loreEvents",
  ReadActivity = "read.activity",
  ReadRank = "read.rank",

  // 桥接能力（仅 App/Web-embedded）
  Bridge = "bridge",
  NavInternal = "nav.internal",
  NavExternal = "nav.external",
  NavApplyHost = "nav.applyHost",
  Toast = "ui.toast",
  Viewport = "ui.viewport",
  EventBack = "event.back",
  EventTokenChanged = "event.tokenChanged",
  EventViewport = "event.viewport",
}

// ————— AllowedRoute 白名单 —————

/** AllowedRoute v1 硬编码白名单 */
export type AllowedRoute =
  | "/tag"
  | "/topic"
  | "/activity"
  | "/ranking"
  | "/collection/interaction"
  | "/oc"
  | "/user"
  | "/generate";

// ————— viewport —————

export interface ViewportInfo {
  /** 嵌入态永远为 0（防双叠加） */
  safeTop: 0;
  safeBottom: number;
  keyboardInset: number;
  width: number;
  height: number;
}

// ————— SDK 选项 —————

export interface TopicSDKOptions {
  /** 后端 API 基址，默认 'https://pre.api.talesofai.cn' */
  apiBaseUrl?: string;
  /** hello 握手超时 ms，默认 1500 */
  helloTimeout?: number;
  /** getEmbedToken bridge 调用超时 ms，默认 3000 */
  tokenTimeout?: number;
  /** embed token 过期前多久触发 re-exchange，ms，默认 5 * 60 * 1000 */
  tokenRefreshEarlyMs?: number;
  /** token 无法恢复时的回调 */
  onAuthLost?: (reason: string) => void;
}

// ————— 公开 API 接口 —————

export interface SDKAuth {
  /** 当前 embed token，匿名时为 null */
  getToken(): string | null;
  /** token 过期时间（UTC ms），匿名时为 null */
  getExpiresAt(): number | null;
  /** 是否已登录（有有效 token） */
  isAuthenticated(): boolean;
}

/** listMyStories 的 kind：favored=当前 user 收藏的本话题作品；created=当前 user 在本话题投稿的作品；liked=当前 user 点赞的本话题作品。 */
export type MyStoryKind = "favored" | "created" | "liked";

export interface SDKTopic {
  /** GET /v1/embed/topic/{name} */
  getDetail(name: string): Promise<TopicDetail>;

  /** GET /v1/embed/topic/{name}/stories */
  listStories(
    name: string,
    query: {
      pageIndex: number;
      pageSize: number;
      sort: "hot" | "like_count" | "highlight_mark_time";
      /** 可选时间窗（UTC ms），透传后端 start_time/end_time */
      startTime?: number;
      /** 可选时间窗（UTC ms），透传后端 start_time/end_time */
      endTime?: number;
      /** 可选作者过滤，透传后端 authorUuid */
      authorUuid?: string;
    },
  ): Promise<Page<StoryCard>>;

  /**
   * GET /v1/embed/topic/{name}/my-stories
   * 当前 embed user 在本话题下的作品：kind=favored（收藏）/ created（投稿）/ liked（点赞）。
   * 匿名（无 embed token）返回空 Page（list=[]、hasNext=false），不抛错、不 401。
   */
  listMyStories(
    name: string,
    query: {
      kind: MyStoryKind;
      pageIndex?: number;
      pageSize?: number;
    },
  ): Promise<Page<StoryCard>>;

  /** GET /v1/embed/topic/{name}/characters */
  listCharacters(
    name: string,
    query: {
      /** 后端为 List[str]（alias parentType），多值。默认 ["oc","elementum"] */
      parentType?: string[];
      pageIndex: number;
      pageSize: number;
      sort?: string;
    },
  ): Promise<Page<CharacterCard>>;

  /** GET /v1/embed/topic/{name}/campaigns */
  listCampaigns(name: string, query: { pageIndex: number; pageSize: number }): Promise<Page<CampaignCard>>;

  /** GET /v1/embed/topic/{name}/lore-events */
  listLoreEvents(name: string): Promise<LoreEvent[]>;

  /**
   * GET /v1/embed/topic/{name}/hot-stories
   * 话题算法热门流（bounded 热门列表，无分页），每条带 hotScore。
   */
  listHot(name: string): Promise<HotStoryCard[]>;

  /**
   * GET /v1/embed/topic/{name}/weekly-hottest
   * 本周最热单品（近 7 天同款 UV 最高的一条），无则 null。
   */
  getWeeklyHottest(name: string): Promise<WeeklyHottest | null>;
}

export interface SDKActivity {
  /** GET /v1/embed/activity/{uuid}/tabs */
  listTabs(uuid: string): Promise<TopicTab[]>;

  /**
   * GET /v1/embed/activity/{uuid}/tab/{tabKey}
   * HighlightPage.topList 仅 pageIndex=0 时非空
   */
  listSelectedStories(
    uuid: string,
    tabKey: string,
    query: {
      pageIndex: number;
      pageSize: number;
      sort?: string;
    },
  ): Promise<HighlightPage>;
}

export interface SDKRank {
  /**
   * GET /v1/embed/rank/{entity}/{window}/{at}
   * entity 直接作为路径段传给后端（facade 内部映射到 collection/user/tcp-oc/tcp-elementum，对外保持 stories/creators/oc/elementum）。
   * at: UTC ms 或字符串 'latest'。
   * 注意：oc / elementum 仅支持 at='latest'，传时间戳后端返回 400（SDK 侧亦会提前抛错）。
   */
  get(
    entity: RankEntity,
    window: RankWindow,
    at: number | "latest",
  ): Promise<Leaderboard<StoryCard | CreatorCard | CharacterCard>>;
}

export interface SDKNav {
  /**
   * 跳进产品内页面（AllowedRoute v1 白名单）。
   *
   * 参数契约按路由性质分两类（SDK 运行期兜底 + 此处类型收窄，缺参构建期/运行期都会被拦）：
   * - **自指路由** `/topic` `/tag` `/activity`：参数=「当前这个」，可省略，SDK 自动从当前页
   *   `?hashtag=` / `?activity_uuid=` 填入（创作者可显式覆盖）。`/ranking` `/generate` 无需参数。
   * - **per-item 路由** `/oc` `/user` `/collection/interaction`：参数指向「具体某个」实体，
   *   **必须传 `uuid`**（来自被点卡片的数据，SDK 无从代填）。
   *
   * guest 上下文（仅本地 dev 无宿主时）本地 dev 无宿主仅 console 提示，不跳转；生产入口恒为宿主内嵌，唤起 App 由宿主承载。
   */
  internal(
    route: "/topic" | "/tag" | "/activity" | "/ranking" | "/generate",
    query?: Record<string, string | number>,
  ): Promise<void>;
  internal(
    route: "/oc" | "/user" | "/collection/interaction",
    query: { uuid: string | number } & Record<string, string | number>,
  ): Promise<void>;

  /**
   * 跳外部 URL。
   * embedded: bridge nav.external
   * guest: window.open(url, '_blank')
   */
  external(url: string): Promise<void>;

  /**
   * 申请创建/主持一个新话题活动空间：跳转到运营配置的申请表单(飞书多维表单)，宿主自动带上
   * 当前登录用户昵称/UID 的 prefill 参数(不含话题名)。**不接受参数**——SDK/页面拿不到、也不经手
   * 这些用户数据，全由宿主本地态直接拼 URL(与 `getEmbedToken` 不下发宿主 token 同一不变量)。
   *
   * 运营未配置申请表单时抛 `BridgeError`（宿主报 not-configured）。
   * guest 上下文（仅本地 dev 无宿主）本地不跳转，仅 console 提示；生产入口恒为宿主内嵌。
   */
  applyHost(): Promise<void>;
}

export interface SDKUi {
  /**
   * 宿主 Toast（embedded）。
   * guest / unsupported：抛 UnsupportedError。
   */
  toast(text: string, options?: { duration?: number; level?: "info" | "warn" }): Promise<void>;

  /**
   * 当前 viewport 安全区信息。
   * guest：抛 UnsupportedError。
   */
  viewport(): Promise<ViewportInfo>;
}

export interface SDKEvents {
  on(event: "tokenChanged", handler: (newToken: string | null) => void): () => void;
  on(event: "viewport", handler: (info: ViewportInfo) => void): () => void;
  on(event: "back", handler: (ev: { preventDefault(): void }) => void): () => void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

// ————— SDK 顶层 —————

export interface TopicSDK {
  env: {
    context: ClientContext;
    embedded: boolean;
    client: BridgeClient | "unknown";
    appVersion: string | null;
    features: string[];
  };
  auth: SDKAuth;
  topic: SDKTopic;
  activity: SDKActivity;
  rank: SDKRank;
  nav: SDKNav;
  ui: SDKUi;
  events: SDKEvents;
  can(cap: Capability): boolean;
  destroy(): void;
}
