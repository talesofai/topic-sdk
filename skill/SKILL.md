---
name: nieta-topic-page
description: >-
  Scaffold, develop, self-check, and publish a dev-draft of a custom embedded
  话题页 (topic page) for nieta-app using the @talesofai/topic-sdk runtime. Use
  this when a creator (or an agent acting for them) wants to build a custom topic
  page, render read-only /v1/embed data, handle the app / web-embedded / guest
  three-state degradation, wire navigation and guest open-app, and publish a
  draft for in-app debugging. The creator delivers the finished and debugged
  project to the internal team for prod publishing. Triggers: "自定义话题页",
  "内嵌话题页", "topic-sdk", "embed topic page", "搭话题页".
---

# nieta-app 自定义内嵌话题页 — 搭建、开发与 dev 发布 skill

你（agent）正代创作者开发一个**内嵌话题页**：一个独立的 Web 单页应用，由 nieta-app 在 `/tag?hashtag=X` 路由内以 **iframe** 内嵌。页面只**读**产品内数据（`/v1/embed/*`），所有写动作由宿主固定浮层承载，页面既不绘制也不调用。

按下面的工作流走，每步带**校验门**，过了再进下一步。详细契约见 `references/api-cheatsheet.md`，红线见 `references/compliance.md`（**交付前必须逐项过**）。

## 入门前必看（非技术用户先看这里）

做内嵌话题页，你（创作者）只要说清楚**业务内容**（话题要展示什么、按钮点了跳哪里），技术活全交给 agent。

> **发布模型（权限分级，后端强制）**：
> - **创作者 → 只能 dev**：用绑定该话题活动的 dev 令牌 + `pnpm deploy:dev` 发**草稿**（不上线），在 app 内用开发者菜单挑这个版本调试；满意后**请内部团队**上线。**创作者永不能 prod。**
> - **内部用户（`is_internal`）→ 可 prod + dev**：用完整登录态 `pnpm deploy:prod` 上线（激活绑定），也可发 dev 草稿。
> - 后端对 `target=prod` / `activate` / `unbind` 只接受 `is_internal` 完整登录态；scoped dev 令牌请求这些动作直接被拒（403）。
> **已有现成 HTML**：把 HTML（或链接）给 agent，说"我有个现成页面想做成话题页"，agent 走 §2 的现成-HTML 入口。
> **SDK 安装**：`@talesofai/topic-sdk` 是**公开仓库**（`github.com/talesofai/topic-sdk`），`pnpm install` 时直接通过 git 源安装，任何人免认证可装，无需特殊权限。

## 总原则（本 skill 的用户多为**非技术的运营/产品同事**，务必遵守）

- **你（agent）代劳一切技术活**：脚手架、写代码、接数据、开发、自测、排错，全部你做。用户不写代码、不碰命令行细节。
- **绝不把技术决策抛给用户**：CSP、AllowedRoute、缓存策略、构建/路由配置、依赖、字段名、token 机制等**一律由你按本 skill / `references/compliance.md` 默认决定**，不要问用户。若标准不支持用户现成页里的某个技术做法，按 `references/migrate-existing-html.md` 的默认处置，**不要回头问技术问题**。
- **只用大白话问"业务"信息，且尽量一次问全**：话题的 `activity_uuid`（用于 dev 发布和本地 dev proxy 自测）、某按钮点了希望跳到哪个站内页、这个话题页要展示哪些内容（榜单/作品/角色）。例：不要问"AllowedRoute 白名单要加哪些 route"，要问"这个'去看榜单'按钮，点了你希望跳到哪个页面?"。
- **错误你来读、你来修**：报错先自己对照校验门与 `references/compliance.md` 诊断修复；只有确实需要用户提供外部信息（业务意图）时，才用大白话说明"需要你做什么"。
- **两条入口**：① 从零做新页 → 走 §2 起脚手架；② **用户已有现成 HTML** → 先按 `references/migrate-existing-html.md` 把它改造进 scaffold，再回到 §3 继续。

## 0. 先读死规矩（贯穿全程，违反即返工）

1. **只读 + 不持写权**：页面只调 `/v1/embed/*` 只读接口，只持 `embed token`（`token_type='embed'`）。**绝不**持有/存储/传递用户的 `x-token`。
2. **写动作全在宿主**（D9）：分享/登录/举报由宿主固定浮层提供，页面不绘制不调用；SDK **不暴露** `overlay.*` 写方法。点赞/关注/收藏这类 per-item 写 → `sdk.nav.internal('/collection/interaction', {uuid})` 点卡跳原生页去做。
3. **URL 统一**：对外唯一身份永远是 `app.nieta.art/tag?hashtag=X`（短链 `t.nieta.art`）。**OSS URL 是内部实现细节，永不写进分享链/`<a href>`/规范链。**
4. **token 只在内存**：不写 `localStorage`/`sessionStorage`/`cookie`。
5. **禁 `history.pushState`**：用 hash 路由或内存路由（否则 Android 返回键会先消费 iframe 内 history）。
6. **viewport `safeTop` 由宿主处理**：页面顶部**不要**再加安全区/Navbar 内边距；只处理 `safeBottom` + 键盘 inset。
7. **三上下文都要兼容**：`app`（iOS/Android 壳）、`web-embedded`（网页版 `/webview`）、`guest`（浏览器裸链，无宿主、token 为 null、写动作唤起 App）。

## 2. 起脚手架（从 `assets/scaffold/` 复制）

> **若用户已有现成 HTML**：先走 `references/migrate-existing-html.md`（把现成页改造进 scaffold：取数改 SDK 只读、写按钮改宿主浮层/nav、外站显示资源打包、去 pushState），改造完再继续本节其余步骤。

把本 skill 的 `assets/scaffold/` 目录复制成创作者项目，然后：
- **不再有 `__TOPIC_UUID__` 占位符**：OSS base / prefix 由内部团队发布时实时从后端取回并注入，创作者侧无需任何全局替换。
- `@talesofai/topic-sdk` 在 `package.json` 里是 **git 依赖**（`git+https://github.com/talesofai/topic-sdk.git`）。仓库是**公开仓库**，`pnpm install` 时 clone 仓库并直接使用其中已提交的预构建 `dist/`，**无构建脚本、零摩擦**，任何人免认证可装，无需 GitHub 特殊权限。**不发 npm。**
- `pnpm install`（同时安装 `ali-oss` 等发布依赖）。

**校验门**：`pnpm install` 成功；Node >= 18、pnpm >= 8。

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

## 5. 导航（唯一漏斗：nav.internal）

- `sdk.nav.internal(route, query?)`：跳产品内页，`route` 必须在 AllowedRoute 白名单内（见 cheatsheet）。**这是唯一的跳转/写意图漏斗**——没有 `sdk.guest.openApp`，唤起 App 由宿主承载（手机浏览器宿主自动唤起 App；原生 App 内站内跳；桌面站内跳）。
- **参数契约**：自指路由（`/topic` `/tag` `/activity`）省略参数时 SDK 自动从当前页 URL 填；per-item 路由（`/oc` `/user` `/collection/interaction`）必须传 `uuid`（来自被点卡片）。**漏传/传错会被 SDK 拦下（构建期类型 + 运行期 throw），不会静默白屏**——详见 cheatsheet 参数表。
- `sdk.nav.external(url)`：外跳（embedded 走 bridge；guest 走 `window.open`）。

**校验门**：所有 `nav.internal` 的 route 都在白名单内；写意图（点赞/关注/登录）一律走 `nav.internal` 跳原生页/由宿主唤起 App，**绝不在页面内尝试本地写**。

## 6. 自测

### 6.1 本地嵌入态自测（mock 宿主 harness，无需真 App）

`pnpm dev:host` 打开**本地 mock 宿主**（`dev-host/`）：它用与真宿主同款 sandbox iframe 嵌你的页面、并扮演 frame-bridge v2 宿主（回 hello、发/拒 token、收 `nav.internal`/`nav.external`、推 `tokenChanged`/`viewport`/`back`），右侧面板看所有桥消息。

→ 不依赖真 App、不依赖真人即可验：握手是否成功、`getEmbedToken` 流程、按钮点了走哪个 `nav.internal` route、`ui.toast`、事件响应、原生 `<a>` 跳转是否被 SDK 拦回（不逃逸 OSS）。

面板「embedToken」留空 = 游客态（数据匿名）；填一个真 pre/prod embed token = 看带 `viewer` 的数据。

> 局限：真机 iOS/Android WebView 三端差异、真实 token 与真 `/v1/embed` 鉴权数据，mock 宿主替代不了——那部分仍需 §7 在真 App 内验。

### 6.2 普通本地预览

`pnpm dev` 直开页面（无宿主 → guest 降级，看渲染 + 匿名数据）。重点：token 流程、可空字段不崩、返回键正常（禁 pushState）、游客写动作唤起 App。

**校验门**：mock 宿主下核心路径（握手 / 数据 / 导航 / 事件）通过；`compliance.md` 功能自测段逐项确认。

## 7. dev 发布（发草稿 + 在 app 真实上下文调试）

本地 dev 预览无法模拟真实 embed 上下文（真 token、桥接、数据）。要做真机调试，需把页面发成**草稿**（不上线），然后在 app 内用开发者菜单挑版本挂载。

### 7.1 获取 dev 令牌（一次性，7 天有效）

1. 用**创作者自己的账号**登录 nieta-app。
2. 进入**该话题页**，点右上角**「⋯」→「开发者菜单」→「生成开发令牌」**（令牌入口在话题页顶栏的开发者菜单里，不在账号设置）。
3. 平台调用 `POST /v1/topic-embed/dev-publish-token`（正常登录态），返回 `{ token, expires_at }`（TTL 7 天）。
4. 复制令牌。

> **令牌绑定具体话题活动**：dev 令牌签发时就**绑定你正在操作的这个话题活动**——只有该活动的创作者（或内部用户）能签发，且签出的令牌**只能对这一个活动发草稿**，对别的话题无效。所以要给哪个话题发草稿，就进哪个话题页生成令牌；换话题要重新生成。
> **令牌安全说明**：这是平台签发的 **scoped dev 令牌**（`token_type='topic_dev_publish'`），与用户完整登录态（`x-token`）、embed token 三向隔离。泄露影响：只能对该话题发草稿，不能上线（prod）、不能做其它用户操作。令牌过期后重新生成。

### 7.2 配置 .env

把脚手架根目录的 `.env.example` 复制成 `.env`，填入：

```bash
NIETA_DEV_PUBLISH_TOKEN=<上一步复制的 dev 令牌>
NIETA_ACTIVITY_UUID=<话题的 activity_uuid>
NIETA_API_BASE=https://api.talesofai.cn
```

`.env` 不要提交 git。

### 7.3 发草稿（dev）

```bash
pnpm deploy:dev
# 等价于：node scripts/deploy.mjs --target dev
```

脚本流程：
1. 用 dev 令牌（`x-dev-publish-token` 头）调 `upload-grant` 拿临时 STS。
2. `vite build`（注入 `VITE_OSS_BASE`）。
3. 上传 dist/ 到 OSS。
4. `POST .../embed-page/publish` body `{ version, target: "dev" }` — **不激活 activeVersion，草稿不上线**。
5. 打印版本号，提示在 app 内开发者菜单选版本。

**校验门**：脚本完成并打印草稿版本号（如 `version=3`）；话题页公众侧无变化（草稿不对外挂载）。

### 7.4 在 app 内调试（真实 embed 上下文）

打开 app → 进入该话题页 → 点右上角**「⋯」→「开发者菜单」**：
- 菜单由宿主 gating：调 `GET .../embed-page/versions` 时返回 200（创作者有权）才显示，公众用户完全不可见。
- 列出所有版本（草稿/active 标注），选择你刚发的版本 → 宿主把 iframe 重挂到该草稿 URL，仍走真实 embed 上下文（真 token、真桥接、真 `/v1/embed` 数据）。
- 也可直链调试：`/tag?hashtag=<X>&embedPreview=<版本号>`（有授权才生效）。

### 7.5 反复迭代

修改代码后重跑 `pnpm deploy:dev` → app 开发者菜单选新版本 → 验证 → 循环，直到满意。

### 7.6 请内部上线

调试满意后，将项目源码（不含 `node_modules/`、`dist/`）交给内部团队。内部团队用 `skill-internal-publish/` 里的流程（`pnpm deploy:prod`）完成上线。

> **创作者只能 dev（发草稿），永不能 prod（上线）。**
> 后端 `target=prod` / `activate` / `unbind` 仅接受 `is_internal` 完整登录态，scoped dev 令牌请求时直接被拒（403）。

## 8. 合规门（上线前必须）

**多数红线已机器兜底**：`pnpm deploy:dev/prod` 会先跑 `tsc --noEmit`（类型门：可空字段裸用 / 不存在字段 / strict 降级）+ **源码红线扫描**（localStorage/sessionStorage/cookie、`history.pushState`、ServiceWorker、写方法 fetch、`EventSource`、`window.parent.postMessage`、自设 CSP `<meta>`、OSS 可见引用、OAuth 残留）+ 单 HTML 入口校验；命中直接 fail 打回。SDK 运行期还会拦原生 `<a>` 跳转（转 bridge）、守卫 `history.pushState`（embedded 即 throw）。**你不必靠记忆遵守这些——违反会在发布/运行时当场报错。**（确系合法的同源用途，可在该行加注释 `sdk-compliance-ok` 豁免，需内部 review。）
>
> **定位说明（重要）**：源码红线扫描是**防手滑的 lint / 纵深防御，不是安全边界**——它逐行正则匹配，可被动态构造（`window["local"+"Storage"]`）、第三方依赖夹带、`sdk-compliance-ok` 注释绕过，且只扫 `src/` 不扫 `node_modules`。**真正的安全边界在后端**：embed token 只读、`/v1/embed/*` 无写接口、token 三向隔离（embed / dev-publish / x-token），即便页面违规也拿不到写能力或 x-token。所以**别把"扫描通过"等同于"安全"**，也别据此放松后端只读约束。

仍需人工逐项过 `references/compliance.md` 的：三端真机自测（§F）、可空字段语义判空是否合理（类型门只保证不裸用）、文案 / 视觉。**任一不过不交付，停下来报告用户。**

### 8.1 agent 自检（纯对话行为，机器拦不了，发布前自我 attest）

- [ ] 全程**没向用户问技术决策**（CSP / 路由 / 缓存 / 字段名 / token / 依赖版本 / AllowedRoute 等）：这些要么已结构固化、要么由运营在线配，问了也改不了。标准不支持用户现成做法时，按 `references/migrate-existing-html.md` 默认处置，不回头问。
- [ ] 向用户的提问都是**业务信息**（话题内容 / 跳转目的地 / activity_uuid），尽量一次问全、用大白话。

---

## 交付

创作者产出：**一个能本地 `pnpm dev` 预览 + `pnpm deploy:dev` 已发草稿 + 通过合规自测的项目**。

交付方式：将项目源码（不含 `node_modules/`、不含 `dist/`）打包或推送 git 仓库，**交给内部团队**。内部团队会用 `skill-internal-publish/` 里的发布流程完成最终上线。

---

**给 agent 的元规则**：本 skill 描述的 SDK/后端契约以 `references/api-cheatsheet.md` 为准（已与已部署后端对齐）。若你发现 SDK 实际 API 与 cheatsheet 不符，**停下来报告差异**，不要擅自猜测或改写契约。
