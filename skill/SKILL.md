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

按下面的工作流走，每步带**校验门**，过了再进下一步。详细契约见 `reference/api-cheatsheet.md`，红线见 `COMPLIANCE.md`（**上线前必须逐项过**）。

## 0. 先读死规矩（贯穿全程，违反即返工）

1. **只读 + 不持写权**：页面只调 `/v1/embed/*` 只读接口，只持 `embed token`（`token_type='embed'`）。**绝不**持有/存储/传递用户的 `x-token`。
2. **写动作全在宿主**（D9）：分享/登录/举报由宿主固定浮层提供，页面不绘制不调用；SDK **不暴露** `overlay.*` 写方法。点赞/关注/收藏这类 per-item 写 → `sdk.nav.internal('/collection/interaction', {uuid})` 点卡跳原生页去做。
3. **URL 统一**：对外唯一身份永远是 `app.nieta.art/tag?hashtag=X`（短链 `t.nieta.art`）。**OSS URL 是内部实现细节，永不写进分享链/`<a href>`/规范链。**
4. **token 只在内存**：不写 `localStorage`/`sessionStorage`/`cookie`。
5. **禁 `history.pushState`**：用 hash 路由或内存路由（否则 Android 返回键会先消费 iframe 内 history）。
6. **viewport `safeTop` 由宿主处理**：页面顶部**不要**再加安全区/Navbar 内边距；只处理 `safeBottom` + 键盘 inset。
7. **三上下文都要兼容**：`app`（iOS/Android 壳）、`web-embedded`（网页版 `/webview`）、`guest`（浏览器裸链，无宿主、token 为 null、写动作唤起 App）。

## 1. 前置条件（校验门：缺一不可往下）

向平台/运营侧取得：① 分配给本话题的 `<uuid>`（对应 OSS 路径 `static/topic/<uuid>/`）；② 限定到该路径的 **STS scoped** 上传凭证（**不得用永久 AK**）。

环境：Node >= 18、pnpm >= 8。创作者在**自己的独立项目**里开发，**无需进 nieta monorepo**。

**校验门**：`<uuid>` 与 STS 凭证已拿到、Node/pnpm 版本达标。否则停下来向用户/平台索取。

## 2. 起脚手架（从 `scaffold/` 复制）

把本 skill 的 `scaffold/` 目录复制成创作者项目，然后：
- 全局把占位符 `__TOPIC_UUID__` 替换成真实 `<uuid>`（出现在 `vite.config.ts`、`package.json` 的 upload 脚本里）。
- `scaffold/.npmrc` 已把 `@talesofai` scope 指向私有 registry `registry.npm.talesofai.cn`；其余依赖走公共 npmjs。
- `cp .env.example .env` 并填入 STS 凭证（`.env` 不提交）。
- `pnpm install`。

**校验门**：`pnpm install` 成功；`grep -r __TOPIC_UUID__` 应只剩注释/无残留（占位符已全部替换）。

## 3. 初始化 SDK + 三态降级（见 `scaffold/src/sdk.ts`）

`createTopicSDK()` 内部按序：端探测 → hello 握手（超时→guest）→ 鉴权（embedded 走 bridge `getEmbedToken`；guest 匿名）→ 能力协商 → 事件订阅。

关键约定：
- `sdk.env.context` ∈ `'app'|'web-embedded'|'guest'`；`sdk.env.embedded` 区分有无宿主。
- `sdk.auth.getToken()` 可能为 `null`（匿名/游客）——这是**正常**情况，降级匿名展示，**不要报错**。
- `onAuthLost` 回调里只做匿名降级 + 日志，不抛错。
- `tokenTimeout` 默认 3000ms，**不要**改成 500（那是 v1 bridge 的历史坏值）。

**校验门**：在 `web-embedded` 下 `sdk.auth.getToken()` 3s 内返回非 null；在 `guest` 下 `sdk.env.embedded===false` 且 token 为 null 而页面不崩。

## 4. 渲染只读数据（见 `scaffold/src/App.tsx` + `reference/api-cheatsheet.md`）

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

## 6. 自测（三上下文逐项过 `COMPLIANCE.md` 的"功能自测"段）

iOS 真机 / Android 真机 / Web（内嵌 + 游客裸链）三套都要过。重点：token 3s 内到、可空字段不崩、返回键正常（禁 pushState）、宿主分享浮层可见而页面无法调 `overlay.*`、游客写动作唤起 App。

## 7. 构建 + 两段式上传（CSP）

`pnpm build` → `pnpm publish`（= build + 上传资产 + 上传 HTML，见 `scaffold/package.json`）。
- **资产**（非 HTML）：长缓存 `max-age=31536000`。
- **HTML**：禁缓存 `no-cache,no-store,must-revalidate` + 由**上传管线** `--headers` 注入 CSP（**不能**让 HTML 内 `<meta>` 自设 CSP，那不可信）。CSP 串见 cheatsheet / scaffold 脚本。
- `ali-oss-utils` **没有 `--noCache`**，用 `--headers "Cache-Control:..."`。

**校验门**：dist 产出；两段上传命令的 `<uuid>` 已替换；CSP 串完整。

## 8. 上线前合规门（必须）

逐项过 `COMPLIANCE.md`。**任一项不过都不许上线**，停下来报告给用户。

---

**给 agent 的元规则**：本 skill 描述的 SDK/后端契约以 `reference/api-cheatsheet.md` 为准（已与已部署后端对齐）。若你发现 SDK 实际 API 与 cheatsheet 不符，**停下来报告差异**，不要擅自猜测或改写契约。
