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
  Toast = "ui.toast",
  Viewport = "ui.viewport",
  EventBack = "event.back",
  EventTokenChanged = "event.tokenChanged",
  EventViewport = "event.viewport",

  // 游客唤起（仅 guest）
  OpenApp = "guest.openApp",
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
  /** 后端 API 基址，默认 'https://api.talesofai.cn' */
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
   * 对 guest 上下文：转为 openApp(route, query) 深链。
   */
  internal(route: AllowedRoute, query?: Record<string, string | number>): Promise<void>;

  /**
   * 跳外部 URL。
   * embedded: bridge nav.external
   * guest: window.open(url, '_blank')
   */
  external(url: string): Promise<void>;
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

export interface GuestOpenApp {
  openApp(route: AllowedRoute, query?: Record<string, string | number>): void;
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
  guest: GuestOpenApp;
  can(cap: Capability): boolean;
  destroy(): void;
}
