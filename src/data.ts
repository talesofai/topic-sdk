import { TopicApiError } from "./errors.js";
import type {
  CampaignCard,
  CharacterCard,
  CreatorCard,
  HighlightPage,
  Leaderboard,
  LoreEvent,
  Page,
  RankEntity,
  RankWindow,
  SDKActivity,
  SDKAuth,
  SDKRank,
  SDKTopic,
  StoryCard,
  TopicDetail,
  TopicTab,
} from "./types.js";

// ————— 内部 fetch 工具 —————

async function apiFetch<T>(
  baseUrl: string,
  path: string,
  auth: SDKAuth,
  query?: Record<string, string | number | string[] | undefined>,
): Promise<T> {
  // 构造 URL
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        // 多值参数（如 parentType=oc&parentType=elementum），对齐后端 List[str]
        for (const item of v) {
          url.searchParams.append(k, String(item));
        }
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  // 构造 headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = auth.getToken();
  if (token) {
    headers["x-embed-token"] = token;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET", headers });
  } catch (err) {
    throw new TopicApiError(-1, "Network error", path, err);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new TopicApiError(response.status, message, path);
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new TopicApiError(-1, "JSON parse error", path, err);
  }
}

// ————— SDKTopicImpl —————

export class SDKTopicImpl implements SDKTopic {
  public constructor(
    private readonly _baseUrl: string,
    private readonly _auth: SDKAuth,
  ) {}

  public async getDetail(name: string): Promise<TopicDetail> {
    return apiFetch<TopicDetail>(this._baseUrl, `/v1/embed/topic/${encodeURIComponent(name)}`, this._auth);
  }

  public async listStories(
    name: string,
    query: {
      pageIndex: number;
      pageSize: number;
      sort: "hot" | "like_count" | "highlight_mark_time";
    },
  ): Promise<Page<StoryCard>> {
    return apiFetch<Page<StoryCard>>(this._baseUrl, `/v1/embed/topic/${encodeURIComponent(name)}/stories`, this._auth, {
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      sort: query.sort,
    });
  }

  public async listCharacters(
    name: string,
    query: {
      parentType?: string[];
      pageIndex: number;
      pageSize: number;
      sort?: string;
    },
  ): Promise<Page<CharacterCard>> {
    return apiFetch<Page<CharacterCard>>(
      this._baseUrl,
      `/v1/embed/topic/${encodeURIComponent(name)}/characters`,
      this._auth,
      {
        parentType: query.parentType,
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        sort: query.sort,
      },
    );
  }

  public async listCampaigns(
    name: string,
    query: { pageIndex: number; pageSize: number },
  ): Promise<Page<CampaignCard>> {
    return apiFetch<Page<CampaignCard>>(
      this._baseUrl,
      `/v1/embed/topic/${encodeURIComponent(name)}/campaigns`,
      this._auth,
      {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
      },
    );
  }

  public async listLoreEvents(name: string): Promise<LoreEvent[]> {
    return apiFetch<LoreEvent[]>(this._baseUrl, `/v1/embed/topic/${encodeURIComponent(name)}/lore-events`, this._auth);
  }
}

// ————— SDKActivityImpl —————

export class SDKActivityImpl implements SDKActivity {
  public constructor(
    private readonly _baseUrl: string,
    private readonly _auth: SDKAuth,
  ) {}

  public async listTabs(uuid: string): Promise<TopicTab[]> {
    return apiFetch<TopicTab[]>(this._baseUrl, `/v1/embed/activity/${encodeURIComponent(uuid)}/tabs`, this._auth);
  }

  public async listSelectedStories(
    uuid: string,
    tabKey: string,
    query: {
      pageIndex: number;
      pageSize: number;
      sort?: string;
    },
  ): Promise<HighlightPage> {
    return apiFetch<HighlightPage>(
      this._baseUrl,
      `/v1/embed/activity/${encodeURIComponent(uuid)}/tab/${encodeURIComponent(tabKey)}`,
      this._auth,
      {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        sort: query.sort,
      },
    );
  }
}

// ————— SDKRankImpl —————

export class SDKRankImpl implements SDKRank {
  public constructor(
    private readonly _baseUrl: string,
    private readonly _auth: SDKAuth,
  ) {}

  public async get(
    entity: RankEntity,
    window: RankWindow,
    at: number | "latest",
  ): Promise<Leaderboard<StoryCard | CreatorCard | CharacterCard>> {
    // oc / elementum 仅支持 latest（后端非 latest 返回 400），提前抛出更友好的错误
    if ((entity === "oc" || entity === "elementum") && at !== "latest") {
      throw new TopicApiError(
        400,
        `rank entity '${entity}' only supports at='latest'`,
        `/v1/embed/rank/${entity}/${window}/${String(at)}`,
      );
    }
    const atStr = at === "latest" ? "latest" : String(at);
    return apiFetch<Leaderboard<StoryCard | CreatorCard | CharacterCard>>(
      this._baseUrl,
      `/v1/embed/rank/${encodeURIComponent(entity)}/${encodeURIComponent(window)}/${encodeURIComponent(atStr)}`,
      this._auth,
    );
  }
}

// ————— PageCursor —————

export class PageCursor<T> {
  private _pageIndex = 0;
  private _hasNext = true;
  private _total: number | null = null;

  public constructor(
    private readonly _fetcher: (pageIndex: number, pageSize: number) => Promise<Page<T>>,
    private readonly _pageSize = 20,
  ) {}

  public hasNext(): boolean {
    return this._hasNext;
  }

  public async next(): Promise<T[]> {
    if (!this._hasNext) return [];
    const page = await this._fetcher(this._pageIndex, this._pageSize);
    this._total = page.total;
    this._hasNext = page.hasNext;
    this._pageIndex += 1;
    return page.list;
  }

  public reset(): void {
    this._pageIndex = 0;
    this._hasNext = true;
    this._total = null;
  }

  public currentPage(): number {
    return this._pageIndex;
  }

  public totalItems(): number | null {
    return this._total;
  }
}
