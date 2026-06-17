---
name: nieta-topic-page
description: >-
  Build, self-check, and ship a custom embedded 话题页 (topic page) for nieta-app
  using the @talesofai/topic-sdk runtime. Use this when a creator or operator (or an
  agent acting for them) wants to scaffold a custom topic page, render read-only
  /v1/embed data, handle the app / web-embedded / guest three-state degradation,
  wire navigation and guest open-app, build the project, and upload it to OSS with
  the correct CSP. Triggers: "自定义话题页", "内嵌话题页", "topic-sdk", "embed topic page",
  "上传话题页到 OSS".
---

# nieta-app 自定义内嵌话题页 — 开发与上线 skill

你（agent）正代创作者/运营开发一个**内嵌话题页**：一个独立的 Web 单页应用，打包上传到 OSS，由 nieta-app 在 `/tag?hashtag=X` 路由内以 **iframe** 内嵌。页面只**读**产品内数据（`/v1/embed/*`），所有写动作由宿主固定浮层承载，页面既不绘制也不调用。

按下面的工作流走，每步带**校验门**，过了再进下一步。详细契约见 `references/api-cheatsheet.md`，红线见 `references/compliance.md`（**上线前必须逐项过**）。

## 入门前必看（非技术用户先看这里）

做内嵌话题页，你（用户）只要先备齐**三样**，技术活之后全交给 agent：
1. **你本人的 nieta 登录 token**（`NIETA_API_TOKEN`）——上线时证明"是你在操作"。
2. **运营/平台分配给这个话题的 `activity_uuid`**——话题在产品里的身份（该活动须已发布 `PUBLISHED`、你对它有管理权）。
3. **后端地址 `NIETA_API_BASE`**（正式 `https://api.talesofai.cn`）。

> **这三样只在最后"上线（§7）"那一步才硬性需要。** 还没拿到也能先开工：让 agent 起脚手架、（若有现成 HTML）改造、开发、本地预览、构建，临上线再补填 `.env`。所以"我还没有 token/uuid"**不挡**先做。
> **已有现成 HTML**：把 HTML（或链接）连同上面三样一起给 agent，说"我有个现成页面想做成话题页"，agent 走 §2 的现成-HTML 入口。
> 装 SDK 需要对私有仓库 `talesofai/topic-sdk` 的 GitHub **读权限**（见 `references/onboarding.md` A1），让管理员一次性配好。

## 总原则（本 skill 的用户多为**非技术的运营/产品同事**，务必遵守）

- **你（agent）代劳一切技术活**：脚手架、写代码、接数据、构建、上传、上线、排错，全部你做。用户不写代码、不碰命令行细节。
- **绝不把技术决策抛给用户**：CSP、AllowedRoute、缓存策略、构建/路由配置、依赖、字段名、token 机制等**一律由你按本 skill / `references/compliance.md` 默认决定**，不要问用户。若标准不支持用户现成页里的某个技术做法，按 `references/migrate-existing-html.md` 的默认处置，**不要回头问技术问题**。
- **只用大白话问"业务"信息，且尽量一次问全**：话题的 `activity_uuid`、用户本人的登录 token、某按钮点了希望跳到哪个站内页、这个话题页要展示哪些内容（榜单/作品/角色）。例：不要问"AllowedRoute 白名单要加哪些 route"，要问"这个'去看榜单'按钮，点了你希望跳到哪个页面?"。
- **错误你来读、你来修**：报错先自己对照校验门与 `references/compliance.md` 诊断修复；只有确实需要用户提供外部信息（权限、token、uuid、业务意图）时，才用大白话说明"需要你做什么"。
- **两条入口**：① 从零做新页 → 走 §2 起脚手架；② **用户已有现成 HTML** → 先按 `references/migrate-existing-html.md` 把它改造进 scaffold，再回到 §3 继续。

## 0. 先读死规矩（贯穿全程，违反即返工）

1. **只读 + 不持写权**：页面只调 `/v1/embed/*` 只读接口，只持 `embed token`（`token_type='embed'`）。**绝不**持有/存储/传递用户的 `x-token`。
2. **写动作全在宿主**（D9）：分享/登录/举报由宿主固定浮层提供，页面不绘制不调用；SDK **不暴露** `overlay.*` 写方法。点赞/关注/收藏这类 per-item 写 → `sdk.nav.internal('/collection/interaction', {uuid})` 点卡跳原生页去做。
3. **URL 统一**：对外唯一身份永远是 `app.nieta.art/tag?hashtag=X`（短链 `t.nieta.art`）。**OSS URL 是内部实现细节，永不写进分享链/`<a href>`/规范链。**
4. **token 只在内存**：不写 `localStorage`/`sessionStorage`/`cookie`。
5. **禁 `history.pushState`**：用 hash 路由或内存路由（否则 Android 返回键会先消费 iframe 内 history）。
6. **viewport `safeTop` 由宿主处理**：页面顶部**不要**再加安全区/Navbar 内边距；只处理 `safeBottom` + 键盘 inset。
7. **三上下文都要兼容**：`app`（iOS/Android 壳）、`web-embedded`（网页版 `/webview`）、`guest`（浏览器裸链，无宿主、token 为 null、写动作唤起 App）。

## 1. 前置条件（上线 §7 才硬性需要，可后补；不挡 §2–§6）

取得三样东西，填进 `.env`（见 `assets/scaffold/.env.example`）：
1. **`NIETA_API_TOKEN`**：创作者/运营自己登录 nieta-app 后的 **API bearer token**（**必须是本人 token，不得用他人的**）。上线脚本用它调 `GET /v1/oss/upload-grant` 实时换取**只 scope 到本话题前缀**的临时 STS（**不再静态持有任何 OSS 凭证，也不再用永久 AK**）。鉴权要求：调用者对该话题有 `can_manage_embed_page` 权限（运营白名单 / 该话题创作者 / 内部员工），且 activity 须 `PUBLISHED`。
2. **`NIETA_ACTIVITY_UUID`**：平台/运营分配给本话题的 `activity_uuid`（对应 OSS 路径 `sts/topic-embed/<uuid>/<version>/`，version 由 grant 自增分配）。
3. **`NIETA_API_BASE`**：后端基址，正式 `https://api.talesofai.cn`。

环境：Node >= 18、pnpm >= 8。创作者在**自己的独立项目**里开发，**无需进 nieta monorepo**。

**校验门（仅针对上线 §7）**：跑 `pnpm publish` 前 `NIETA_API_TOKEN` / `NIETA_ACTIVITY_UUID` / `NIETA_API_BASE` 必须就绪。但**起脚手架 / 改造现成 HTML / 开发 / 构建（§2–§6）不需要它们**——先做，临上线再补填 `.env`，避免"没 token 就卡死"。Node/pnpm 版本则一开始就要达标。**与 §2「现成 HTML」无先后冲突**：有现成 HTML 就先走 §2 改造，token/uuid 留到 §7 再补。

## 2. 起脚手架（从 `assets/scaffold/` 复制）

> **若用户已有现成 HTML**：先走 `references/migrate-existing-html.md`（把现成页改造进 scaffold：取数改 SDK 只读、写按钮改宿主浮层/nav、外站显示资源打包、去 pushState），改造完再继续本节其余步骤。

把本 skill 的 `assets/scaffold/` 目录复制成创作者项目，然后：
- **不再有 `__TOPIC_UUID__` 占位符**：上线脚本从 `.env` 读 `NIETA_ACTIVITY_UUID`，OSS base / prefix 由 `GET /v1/oss/upload-grant` 实时返回并注入，无需任何全局替换。
- `@talesofai/topic-sdk` 在 `package.json` 里是 **git 依赖**（`git+https://github.com/talesofai/topic-sdk.git`，组织内私有仓库；`pnpm install` 时 clone 仓库并直接使用其中已提交的预构建 `dist/`，**无构建脚本、零摩擦**，需对该仓库有访问权）。**不发 npm。** 上传用公共 npmjs 的 `ali-oss`（直接 `import`，因 CLI 不支持 stsToken）。
  - **若 `pnpm install` 报 `repository not found` / 卡在认证**：是 GitHub 访问权没配好——见 `references/onboarding.md` A1，让管理员把用户加进 `talesofai` org（或给该仓库 read 权）、配好 git 凭据后重试。这是平台侧一次性配置，不要让用户在这里纠结。
- `cp .env.example .env` 并填入 `NIETA_API_TOKEN`（本人 bearer）+ `NIETA_ACTIVITY_UUID` + `NIETA_API_BASE`（`.env` 不提交）。
- `pnpm install`。

**校验门**：`pnpm install` 成功；`.env` 三个变量已填且非占位符。

## 3. 初始化 SDK + 三态降级（见 `assets/scaffold/src/sdk.ts`）

`createTopicSDK()` 内部按序：端探测 → hello 握手（超时→guest）→ 鉴权（embedded 走 bridge `getEmbedToken`；guest 匿名）→ 能力协商 → 事件订阅。

关键约定：
- `sdk.env.context` ∈ `'app'|'web-embedded'|'guest'`；`sdk.env.embedded` 区分有无宿主。
- `sdk.auth.getToken()` 可能为 `null`（匿名/游客）——这是**正常**情况，降级匿名展示，**不要报错**。
- `onAuthLost` 回调里只做匿名降级 + 日志，不抛错。
- `tokenTimeout` 默认 3000ms，**不要**改成 500（那是 v1 bridge 的历史坏值）。

**校验门**：在 `web-embedded` 下 `sdk.auth.getToken()` 3s 内返回非 null；在 `guest` 下 `sdk.env.embedded===false` 且 token 为 null 而页面不崩。

## 4. 渲染只读数据（见 `assets/scaffold/src/App.tsx` + `references/api-cheatsheet.md`）

全部走 `sdk.topic.*` / `sdk.activity.*` / `sdk.rank.*`，均为只读。**契约要点（已与已部署后端对齐）**：
- 大量字段可空：`StoryCard.aspect`、`StoryCard.author.uuid`、`CharacterCard.author.uuid`、`CreatorCard.uuid`、`Leaderboard.startTime/endTime`、`TopicDetail.startTime/endTime` 等都可能为 `null` —— 渲染前**必须判空**（尤其用 `author.uuid` 拼跳转、用 `startTime*1000` 做时间）。
- `viewer` 只有 `{ subscribed, canEdit }`，匿名时整个 `viewer` 为 `null`。**没有 `hasReviewPermission`**。
- `listCharacters` 的 `parentType` 是 `string[]`（省略时后端默认 `['oc','elementum']`）。
- `sdk.rank.get(entity, window, at)`：`oc`/`elementum` **只支持 `at='latest'`**，传时间戳会抛错。
- 分页用 `page.hasNext` 判断是否还有下一页（不要自己用 total 推算）。

**校验门**：`getDetail` + `listStories` 能渲染；对所有可空字段已判空（grep 一遍 `.uuid`/`.aspect`/`.startTime` 的使用点）。

## 5. 导航 + 游客唤起 App

- `sdk.nav.internal(route, query?)`：跳产品内页，`route` 必须在 AllowedRoute 白名单内（见 cheatsheet）。`guest` 上下文会自动转成唤起 App 深链。
- `sdk.nav.external(url)`：外跳（embedded 走 bridge；guest 走 `window.open`）。
- 游客态写动作：用 `sdk.guest.openApp(route, query?)`（Universal Link 为主，微信/QQ 内置浏览器会弹原生 alert 引导）。

**校验门**：所有 `nav.internal` 的 route 都在白名单内；游客态点"登录/点赞"等走 `openApp` 而非尝试本地写。

## 6. 自测（三上下文逐项过 `references/compliance.md` 的"功能自测"段）

iOS 真机 / Android 真机 / Web（内嵌 + 游客裸链）三套都要过。重点：token 3s 内到、可空字段不崩、返回键正常（禁 pushState）、宿主分享浮层可见而页面无法调 `overlay.*`、游客写动作唤起 App。

## 7. 构建 + 两段式上传（CSP）

`pnpm publish`（= `node scripts/deploy.mjs`，见 `assets/scaffold/package.json`）。脚本按序：
1. **upload-grant**：调 `GET /v1/oss/upload-grant?purpose=topic_embed_page&activity_uuid=<uuid>`（Bearer `NIETA_API_TOKEN`），拿到 `version` + 临时 STS + `prefix` + `base_url`。**打印 `version`**。
2. **build（base 注入）**：把 `base_url` 写入 `VITE_OSS_BASE` 后 `pnpm vite build`，产物里资产引用即指向 `sts/topic-embed/<uuid>/<version>/`，无占位符。
3. **本地预检**：确认 `dist/index.html` 存在（否则 publish 会被服务端 400 `missing index.html`）。
4. **两段式上传**（`ali-oss`，带 `stsToken`）：
   - **资产**（非 HTML）：长缓存 `Cache-Control: max-age=31536000`。
   - **HTML**：禁缓存 `no-cache,no-store,must-revalidate` + 由**上传时的对象 header** 注入 CSP（**不能**让 HTML 内 `<meta>` 自设 CSP，那不可信）。CSP 串见 `assets/scaffold/scripts/deploy.mjs`。
5. **publish（发布即绑定）**：调 `POST /v1/topic-embed/activities/<uuid>/embed-page/publish` 体 `{version}`；服务端校验 prefix/index.html 存在后激活并绑定话题，返回 `{enabled, active_version, versions, updated_at}`。

预检不上线：`pnpm deploy:dry`（= `--dry-run`，跑 grant + build + 本地校验，跳过上传/publish）。

**校验门**：upload-grant 返回的 `version` 已打印；dist 产出且含 `index.html`；publish 成功后 `active_version` 与该 `version` 一致（脚本会断言）；CSP 串完整。

## 8. 上线前合规门（必须）

逐项过 `references/compliance.md`。**任一项不过都不许上线**，停下来报告给用户。

---

**给 agent 的元规则**：本 skill 描述的 SDK/后端契约以 `references/api-cheatsheet.md` 为准（已与已部署后端对齐）。若你发现 SDK 实际 API 与 cheatsheet 不符，**停下来报告差异**，不要擅自猜测或改写契约。
