interface Page<T> {
    total: number;
    pageIndex: number;
    pageSize: number;
    list: T[];
    /** facade 重算（修复 api_hashtag.py:693 bug） */
    hasNext: boolean;
}
interface RichText {
    contentType: "text" | "html" | "markdown";
    /** html 类型必须服务端消毒（sanitize）后下发 */
    content: string;
}
interface TopicTab {
    key: string;
    label: string;
    visible: boolean;
}
interface TopicDetail {
    hashtagName: string;
    kind: "hashtag" | "activity";
    activityUuid: string | null;
    title: string | null;
    description: RichText | null;
    bannerPic: string | null;
    smallBannerPic: string | null;
    headerPic: string | null;
    phase: "draft" | "preparing" | "running" | "ended" | null;
    startTime: number | null;
    endTime: number | null;
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
interface StoryCard {
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
/** 话题算法热门流的作品卡片：现有 StoryCard 全字段 + 热度分（已乘 1000 取整）。 */
interface HotStoryCard extends StoryCard {
    /** 热度分（后端 doc.sort[0]*1000 取整），int。 */
    hotScore: number;
}
/** 本周最热单品（近 7 天同款 UV 最高的一条），无则 null。全 camelCase。 */
interface WeeklyHottest {
    collectionUuid: string;
    title: string;
    coverUrl: string | null;
    sameStyleUv: number;
    creatorName: string;
    creatorUuid: string;
    creatorAvatar: string | null;
    isInteractive: boolean;
}
interface HighlightPage extends Page<StoryCard & {
    highlightTime: number | null;
}> {
    /** topList 仅 pageIndex=0 时非空，其余页为 [] */
    topList: StoryCard[];
}
interface CharacterCard {
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
interface CampaignCard {
    uuid: string;
    title: string | null;
    coverUrl: string | null;
    pv: number;
}
interface LoreEvent {
    uuid: string;
    name: string;
    category: string | null;
    description: string | null;
    sortIndex: number;
    collectionCount: number;
    boundTopic: {
        name: string;
        startTime: number | null;
        endTime: number | null;
    } | null;
    stories: StoryCard[];
}
type RankWindow = "daily" | "weekly" | "monthly";
type RankEntity = "stories" | "creators" | "oc" | "elementum";
interface Leaderboard<T> {
    window: RankWindow;
    entity: RankEntity;
    startTime: number | null;
    endTime: number | null;
    lastUpdatedAt: number | null;
    list: RankEntry<T>[];
}
interface RankEntry<T> {
    rank: number;
    /** 经 score_multiplier 缩放后的整数 */
    score: number;
    item: T;
}
interface CreatorCard {
    uuid: string | null;
    nickName: string | null;
    avatarUrl: string | null;
    subscriberCount: number;
    storyCount: number;
    topStories: StoryCard[];
}
type ClientContext = "app" | "web-embedded" | "guest";
/** hello 响应中的 client 字段（宿主回传具体平台） */
type BridgeClient$1 = "ios" | "android" | "web";
interface HelloResult {
    /** 宿主平台 */
    client: BridgeClient$1;
    /** App 版本号，Web 宿主为 null */
    appVersion: string | null;
    /** 宿主支持的 bridge method 列表 */
    features: string[];
}
declare enum Capability {
    ReadTopic = "read.topic",
    ReadStories = "read.stories",
    ReadCharacters = "read.characters",
    ReadCampaigns = "read.campaigns",
    ReadLoreEvents = "read.loreEvents",
    ReadActivity = "read.activity",
    ReadRank = "read.rank",
    Bridge = "bridge",
    NavInternal = "nav.internal",
    NavExternal = "nav.external",
    Toast = "ui.toast",
    Viewport = "ui.viewport",
    EventBack = "event.back",
    EventTokenChanged = "event.tokenChanged",
    EventViewport = "event.viewport"
}
/** AllowedRoute v1 硬编码白名单 */
type AllowedRoute = "/tag" | "/topic" | "/activity" | "/ranking" | "/collection/interaction" | "/oc" | "/user" | "/generate";
interface ViewportInfo {
    /** 嵌入态永远为 0（防双叠加） */
    safeTop: 0;
    safeBottom: number;
    keyboardInset: number;
    width: number;
    height: number;
}
interface TopicSDKOptions {
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
interface SDKAuth {
    /** 当前 embed token，匿名时为 null */
    getToken(): string | null;
    /** token 过期时间（UTC ms），匿名时为 null */
    getExpiresAt(): number | null;
    /** 是否已登录（有有效 token） */
    isAuthenticated(): boolean;
}
interface SDKTopic {
    /** GET /v1/embed/topic/{name} */
    getDetail(name: string): Promise<TopicDetail>;
    /** GET /v1/embed/topic/{name}/stories */
    listStories(name: string, query: {
        pageIndex: number;
        pageSize: number;
        sort: "hot" | "like_count" | "highlight_mark_time";
    }): Promise<Page<StoryCard>>;
    /** GET /v1/embed/topic/{name}/characters */
    listCharacters(name: string, query: {
        /** 后端为 List[str]（alias parentType），多值。默认 ["oc","elementum"] */
        parentType?: string[];
        pageIndex: number;
        pageSize: number;
        sort?: string;
    }): Promise<Page<CharacterCard>>;
    /** GET /v1/embed/topic/{name}/campaigns */
    listCampaigns(name: string, query: {
        pageIndex: number;
        pageSize: number;
    }): Promise<Page<CampaignCard>>;
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
interface SDKActivity {
    /** GET /v1/embed/activity/{uuid}/tabs */
    listTabs(uuid: string): Promise<TopicTab[]>;
    /**
     * GET /v1/embed/activity/{uuid}/tab/{tabKey}
     * HighlightPage.topList 仅 pageIndex=0 时非空
     */
    listSelectedStories(uuid: string, tabKey: string, query: {
        pageIndex: number;
        pageSize: number;
        sort?: string;
    }): Promise<HighlightPage>;
}
interface SDKRank {
    /**
     * GET /v1/embed/rank/{entity}/{window}/{at}
     * entity 直接作为路径段传给后端（facade 内部映射到 collection/user/tcp-oc/tcp-elementum，对外保持 stories/creators/oc/elementum）。
     * at: UTC ms 或字符串 'latest'。
     * 注意：oc / elementum 仅支持 at='latest'，传时间戳后端返回 400（SDK 侧亦会提前抛错）。
     */
    get(entity: RankEntity, window: RankWindow, at: number | "latest"): Promise<Leaderboard<StoryCard | CreatorCard | CharacterCard>>;
}
interface SDKNav {
    /**
     * 跳进产品内页面（AllowedRoute v1 白名单）。
     *
     * 参数契约按路由性质分两类（SDK 运行期兜底 + 此处类型收窄，缺参构建期/运行期都会被拦）：
     * - **自指路由** `/topic` `/tag` `/activity`：参数=「当前这个」，可省略，SDK 自动从当前页
     *   `?hashtag=` / `?activity_uuid=` 填入（创作者可显式覆盖）。`/ranking` `/generate` 无需参数。
     * - **per-item 路由** `/oc` `/user` `/collection/interaction`：参数指向「具体某个」实体，
     *   **必须传 `uuid`**（来自被点卡片的数据，SDK 无从代填）。
     *
     * guest 上下文（仅本地 dev 无宿主时）内部转 openApp 深链；生产入口恒为宿主内嵌，唤起 App 由宿主承载。
     */
    internal(route: "/topic" | "/tag" | "/activity" | "/ranking" | "/generate", query?: Record<string, string | number>): Promise<void>;
    internal(route: "/oc" | "/user" | "/collection/interaction", query: {
        uuid: string | number;
    } & Record<string, string | number>): Promise<void>;
    /**
     * 跳外部 URL。
     * embedded: bridge nav.external
     * guest: window.open(url, '_blank')
     */
    external(url: string): Promise<void>;
}
interface SDKUi {
    /**
     * 宿主 Toast（embedded）。
     * guest / unsupported：抛 UnsupportedError。
     */
    toast(text: string, options?: {
        duration?: number;
        level?: "info" | "warn";
    }): Promise<void>;
    /**
     * 当前 viewport 安全区信息。
     * guest：抛 UnsupportedError。
     */
    viewport(): Promise<ViewportInfo>;
}
interface SDKEvents {
    on(event: "tokenChanged", handler: (newToken: string | null) => void): () => void;
    on(event: "viewport", handler: (info: ViewportInfo) => void): () => void;
    on(event: "back", handler: (ev: {
        preventDefault(): void;
    }) => void): () => void;
    off(event: string, handler: (...args: unknown[]) => void): void;
}
interface TopicSDK {
    env: {
        context: ClientContext;
        embedded: boolean;
        client: BridgeClient$1 | "unknown";
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

type EventHandler = (data: unknown) => void;
/**
 * frame-bridge v2 客户端。
 * 负责与宿主（window.parent）通过 postMessage 通信。
 */
declare class BridgeClient {
    private readonly _pending;
    private readonly _eventHandlers;
    private readonly _defaultTimeout;
    private _destroyed;
    constructor(defaultTimeout?: number);
    /**
     * 向宿主发送请求，等待回包。
     */
    send<T = unknown>(method: string, params?: unknown, timeout?: number): Promise<T>;
    /**
     * 订阅宿主主动推送的事件。
     */
    onEvent(event: string, handler: EventHandler): void;
    /**
     * 取消订阅。
     */
    offEvent(event: string, handler: EventHandler): void;
    /**
     * hello 握手。
     * 超时时返回 null（表示 guest 模式）。
     */
    hello(sdkVersion: string, timeout?: number): Promise<HelloResult | null>;
    /**
     * 销毁，清理所有 listener 和 pending。
     */
    destroy(): void;
    private _onMessage;
}

declare class PageCursor<T> {
    private readonly _fetcher;
    private readonly _pageSize;
    private _pageIndex;
    private _hasNext;
    private _total;
    constructor(_fetcher: (pageIndex: number, pageSize: number) => Promise<Page<T>>, _pageSize?: number);
    hasNext(): boolean;
    next(): Promise<T[]>;
    reset(): void;
    currentPage(): number;
    totalItems(): number | null;
}

/**
 * HTTP API 错误
 * statusCode -1 = 网络错误/解析失败
 */
declare class TopicApiError extends Error {
    readonly statusCode: number;
    readonly endpoint: string;
    readonly cause?: unknown;
    constructor(statusCode: number, message: string, endpoint: string, cause?: unknown);
}
/**
 * frame-bridge 通信错误
 */
declare class BridgeError extends Error {
    readonly code: "timeout" | "rejected" | "origin-mismatch" | "method-not-allowed" | "parse-error";
    readonly method: string;
    readonly requestId: string;
    readonly cause?: unknown;
    constructor(code: "timeout" | "rejected" | "origin-mismatch" | "method-not-allowed" | "parse-error", method: string, requestId: string, cause?: unknown);
}
/**
 * 能力不支持错误（不静默 no-op，统一抛出）
 */
declare class UnsupportedError extends Error {
    readonly capability: Capability | string;
    readonly context: ClientContext;
    constructor(capability: Capability | string, context: ClientContext);
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
declare function createTopicSDK(options?: TopicSDKOptions): Promise<TopicSDK>;

export { type AllowedRoute, BridgeClient, type BridgeClient$1 as BridgeClientType, BridgeError, type CampaignCard, Capability, type CharacterCard, type ClientContext, type CreatorCard, type HelloResult, type HighlightPage, type Leaderboard, type LoreEvent, type Page, PageCursor, type RankEntity, type RankEntry, type RankWindow, type RichText, type SDKActivity, type SDKAuth, type SDKEvents, type SDKNav, type SDKRank, type SDKTopic, type SDKUi, type StoryCard, TopicApiError, type TopicDetail, type TopicSDK, type TopicSDKOptions, type TopicTab, UnsupportedError, type ViewportInfo, createTopicSDK };
