# 把现成 HTML 改造成内嵌话题页 — agent 执行指南

> 面向 AI agent 执行。每节末的"自检"步骤是 agent 自己跑、自己确认，无需问用户。
> 本指南假设 agent 已读过 SKILL.md §0、references/compliance.md、references/api-cheatsheet.md。

---

## 0. 读完这份文件再动手

改造顺序：§1 可行性 triage → §2 收集必问信息 → §3 逐步改造 → §4 决策树（遇到不支持的功能时查） → §5 完成后接回 SKILL.md §3

---

## 1. 可行性 triage — 按形态分类

对照下表逐项标记现成 HTML 属于哪一类（可同时命中多类）。

### 类型 A：纯静态展示页（无外部请求，只有写死的 HTML/CSS/JS）

- **判定**：内容全部写死，没有 `fetch`/`XMLHttpRequest`/`$.ajax`，没有 `<script src="外站">`。
- **结论**：易改。结构/样式可直接迁入 scaffold，只需接上 SDK 数据调用替换写死内容。
- **改造动作**：执行 §3.1 → §3.2 → §3.3 → §3.4 → §3.6。

### 类型 B：有外部数据 API 调用（fetch 自己的 API 或第三方）

- **判定**：页面里有 `fetch('https://...')` 或 `$.ajax(...)` 调用外部接口取数据。
- **结论**：需改造。
  - 如果外部接口返回的是话题/作品/榜单数据 → **必须全部替换为 SDK 只读调用**（`sdk.topic.*`/`sdk.activity.*`/`sdk.rank.*`），原接口不再使用。
  - 如果是完全无关的第三方数据（如天气、外部商店）→ 见 §4 决策树条目 D1。
- **改造动作**：§3.1 → §3.2 → §3.3(取数替换) → §3.4 → §3.6。

### 类型 C：有写交互按钮（点赞、关注、收藏、发布、评论、登录等）

- **判定**：页面有调用写接口的按钮/表单，或有登录/鉴权流程。
- **结论**：需改造。写动作不能留在页面里。
  - 点赞/关注/收藏 → 改成 `sdk.nav.internal('/collection/interaction', {uuid})` 跳原生页。
  - 分享/登录/举报 → 删掉页面里的实现，嵌入态由宿主固定浮层承载（无需页面做任何事）；游客态用 `sdk.guest.openApp(route, query)` 唤起 App。
  - 发布/评论/删除等写操作 → 整块删除，没有替代方案，见 §4 决策树条目 D2。
- **改造动作**：§3.1 → §3.2 → §3.3 → §3.5(写按钮处理) → §3.6。

### 类型 D：有外站 CDN 资源（图片图床、Google Fonts、外站 CSS/JS）

- **判定**：HTML/CSS 里有 `src="https://外站域名/..."` 的图片/字体/媒体，或 `<link href="https://fonts.googleapis.com/...">` 等外站样式/字体，或 `<script src="https://cdn.jsdelivr.net/...">` 等外站 JS。
- **结论**：外站**显示资源**（图片/字体/CSS/媒体）必须本地化；外站 JS 单独处理。
  - 图片/字体/媒体/CSS：下载到本地，放入 `public/assets/`，改用相对路径引用。
  - 外站 JS（如 jQuery CDN、图表库 CDN）：①优先改用 npm 包并让 vite 打包；②若必须保留 CDN，需向运营申请加入 `script-src` 名单（见 §4 决策树条目 D3）。
  - base64 / `data:` URI 内联的媒体（视频/音频）：必须提取为文件，放 `public/`，见 §4 决策树条目 D4。
- **改造动作**：§3.1 → §3.4(资源本地化) → §3.2 → §3.3 → §3.6。

### 类型 E：用了前端框架（React / Vue / Svelte / Angular）

- **判定**：有 `import React from 'react'`，或 `Vue.createApp(...)`，或相应框架痕迹。
- **结论**：
  - **React**：与 scaffold 同框架，最顺。把框架代码迁入 `src/`，接入 SDK 即可。
  - **Vue/Svelte**：需替换 vite.config.ts 的 plugin（`@vitejs/plugin-vue` 或 `@sveltejs/vite-plugin-svelte`），加入 `devDependencies`，`tsconfig.json` 的 `jsx` 设置去掉或改；其余流程一样。agent 自行修改配置，不问用户。
  - **jQuery / 无框架原生 JS**：不需要换框架；把 JS 直接放 `src/main.ts`（去掉 `.tsx`），vite.config.ts 去掉 `react()` plugin，不需要 `@vitejs/plugin-react`。注意 jQuery 习惯操作 DOM，改造后用原生 DOM API 或轻量框架均可；但 SDK 调用必须是 ESM import。
  - **Angular**：构建体系不同，不能直接复用 vite scaffold；**必须重写构建配置**（保留 Angular CLI 构建，只把 deploy.mjs 逻辑移植过来）。
- **改造动作**：§3.0(框架适配) → §3.1 → §3.2 → §3.3 → §3.6。

### 类型 F：多页 / 有 `history.pushState` 路由

- **判定**：有多个 `<a href="/page2">` 的真实路径跳转，或显式调用 `history.pushState()`，或使用 React Router v6 的 `createBrowserRouter`，或 Vue Router 的 `createWebHistory()`。
- **结论**：**必须改路由模式**。
  - React Router：改用 `createHashRouter` 或 `createMemoryRouter`。
  - Vue Router：`createWebHistory()` 改为 `createWebHashHistory()` 或 `createMemoryHistory()`。
  - 原生 `history.pushState` 调用：全部删掉，改用 `location.hash` 或内存变量追踪当前视图状态。
  - 多个真实 HTML 文件（`page1.html`, `page2.html`）：合并为单页，用 hash/内存路由切换视图。
- **改造动作**：§3.1 → §3.2 → §3.3 → §3.7(路由改造) → §3.6。

---

## 2. 开始前必须收集的信息

### 2A. 必须向用户（用大白话）确认的业务信息

以下内容 agent 无法自行决定，必须问用户后才能继续：

| # | 问用户的问题（大白话） | 对应技术字段 |
|---|---|---|
| Q1 | 这个话题页对应哪个话题？请提供话题的 `activity_uuid`（平台/运营已分配，形如一串字母数字）。 | `.env` 的 `NIETA_ACTIVITY_UUID` |
| Q2 | 登录 nieta-app 后，请在 App 的"我的"→"开发者"或找运营同学拿到你的 **API bearer token**（以 `Bearer ` 开头的那串），用来上传页面。 | `.env` 的 `NIETA_API_TOKEN` |
| Q3 | 页面里有"查看作品详情"这类跳转按钮，你希望点了之后跳到 App 里的哪个页面？（例如：跳作品详情页、跳话题页、跳排行榜……） | `sdk.nav.internal` 的 route 参数 |
| Q4 | 页面里展示榜单数据，是要展示日榜、周榜还是月榜？是作品榜、创作者榜，还是 OC/元素榜？ | `sdk.rank.get(entity, window, at)` 的参数 |
| Q5 | 页面里展示的精选内容对应活动的哪个 tab？（如果你知道 tab key 就填，不知道可以让 agent 用 `sdk.activity.listTabs(uuid)` 动态查） | `sdk.activity.listSelectedStories` 的 tabKey |

**不需要问用户的技术问题**（agent 自行决定）：CSP 头内容、OSS 缓存策略、路由模式选择、构建配置、vite base 注入方式、`tokenTimeout` 值、AllowedRoute 白名单判断、`safeTop/safeBottom` 设置、import 路径、TypeScript 配置。

### 2B. agent 自动决定的技术取舍（一律不问用户）

| 技术问题 | 默认决策 |
|---|---|
| 路由模式 | 有 `pushState` 一律改为 `createHashRouter`（React）或 `createWebHashHistory`（Vue） |
| CSP 头 | 由 `deploy.mjs` 的 `buildHtmlCsp()` 在上传时动态注入，页面 `<meta>` 不设 CSP |
| OSS 缓存 | HTML → `no-cache,no-store,must-revalidate`；其他资产 → `max-age=31536000` |
| tokenTimeout | 固定 3000ms，不改 |
| safeTop | 不加，固定为 0（宿主已处理） |
| `onAuthLost` | 降级匿名展示 + `console.warn`，不抛错 |
| 外站 npm 包 CDN → 本地 | agent 自行 `pnpm add <包名>` 并修改 import |
| 外站图片/字体/CSS | 下载到 `public/assets/`，改相对路径 |
| sourcemap | `"hidden"`（保留但不在产物里引用） |
| TypeScript strictness | 保持 scaffold 的 `strict: true`，若迁移代码有类型错误 agent 修复，不降低严格度 |

---

## 3. 逐步改造流程

### §3.0 框架适配（仅类型 E 非 React 时执行）

**Vue：**
```bash
pnpm add vue
pnpm add -D @vitejs/plugin-vue
```
修改 `vite.config.ts`：把 `import react from "@vitejs/plugin-react"` 改为 `import vue from "@vitejs/plugin-vue"`，plugins 改 `[vue()]`。
`tsconfig.json` 里删掉 `"jsx": "react-jsx"`，加 `"jsx": "preserve"`（或直接删 jsx 行，Vue SFC 不走 jsx）。
把 `main.tsx` 改为 `main.ts`，入口改为 `createApp(App).mount('#root')`。

**原生 JS / jQuery：**
`vite.config.ts` 去掉 `react()` plugin，删除 `@vitejs/plugin-react` devDependency。
入口文件改为 `src/main.ts`（或 `.js`，去掉 tsx 扩展名）。
把现成 HTML 里的内联 `<script>` 内容提取到 `src/main.ts`，用 ESM `import` 引入 SDK。
jQuery 如果是 CDN 引入，改为 `pnpm add jquery` 并 `import $ from 'jquery'`（若不再需要 jQuery 则直接删掉，用原生 DOM 或 SDK 调用代替）。

**自检**：`pnpm dev` 能启动，控制台无 `Cannot find module` 报错。

---

### §3.1 从 scaffold 建立工作目录

1. 把 `skill/assets/scaffold/` 目录内所有文件复制为创作者的独立项目目录（不在 monorepo 内）。
2. 执行 `cp .env.example .env`，填入 Q1/Q2 收集到的 `NIETA_ACTIVITY_UUID` 和 `NIETA_API_TOKEN`，`NIETA_API_BASE` 填 `https://api.talesofai.cn`。
3. `pnpm install`。

**自检**：`pnpm install` 成功，`.env` 三个变量不是占位符值，`node_modules/@talesofai/topic-sdk` 存在。

---

### §3.2 把现成 HTML 结构迁入 scaffold

**index.html：**
- 保留 scaffold 的 `<meta charset>` 和 `<meta name="viewport">` 行（内容必须与 scaffold 一致：`viewport-fit=cover`，无 `user-scalable=yes`）。
- 保留 `<div id="root"></div>` 和 `<script type="module" src="/src/main.tsx">` 这两行。
- 现成 HTML 的 `<title>` 可以改成话题名。
- **不要** 把现成 HTML 的 `<body>` 内容直接放进 scaffold 的 `index.html`——那些内容要进 React/Vue 组件或 `src/main.ts` 里，不是写在 `index.html` 里。
- **删除** 现成 HTML 里的任何 `<meta http-equiv="Content-Security-Policy" ...>`——CSP 由上传管线注入，页面自设无效。

**CSS：**
- 如果是外链 CSS（`<link rel="stylesheet" href="./style.css">`）：把 CSS 文件复制到 `src/style.css`，在 `main.tsx`（或对应入口）里 `import './style.css'`，vite 会打包内联。
- 如果是内联 `<style>` 块：提取为 `.css` 文件，同上处理。
- **删除** 所有 `<link rel="stylesheet" href="https://外站/...">` 的外站 CSS 引用，改造方式见 §3.4。

**自检**：`pnpm dev` 能打开页面，CSS 样式基本生效，控制台无 `Failed to load resource` 报错（除了预期中的 API 接口未接入）。

---

### §3.3 替换取数逻辑为 SDK 只读调用

**把现成的取数改写为 SDK 调用。以 React 为例（Vue/原生 JS 逻辑相同，只是语法不同）：**

```typescript
// src/sdk.ts（直接使用 scaffold 的文件，不用改）
// 从现成 HTML 的 js 里找到所有 fetch/$.ajax 调用，逐一对照下表替换

// 话题基本信息（标题、banner、开始/结束时间、参与者数等）
const detail = await sdk.topic.getDetail(hashtag);
// 注意：detail.startTime / detail.endTime / detail.title 等均可能为 null，渲染前判空

// 话题作品列表（支持分页）
const page = await sdk.topic.listStories(hashtag, { pageIndex: 0, pageSize: 20, sort: 'hot' });
// page.hasNext 判断是否有下一页（不要用 page.total 推算）

// 话题角色列表
const chars = await sdk.topic.listCharacters(hashtag, { pageIndex: 0, pageSize: 20 });

// 话题活动/周边
const campaigns = await sdk.topic.listCampaigns(hashtag, { pageIndex: 0, pageSize: 20 });

// 世界观/剧情事件
const lore = await sdk.topic.listLoreEvents(hashtag);

// 活动精选 tabs
const tabs = await sdk.activity.listTabs(activityUuid);
// 精选作品（第一页时 topList 非空）
const highlight = await sdk.activity.listSelectedStories(activityUuid, tabKey, { pageIndex: 0, pageSize: 20 });

// 榜单（entity: 'stories'|'creators'|'oc'|'elementum'）
const board = await sdk.rank.get('stories', 'weekly', 'latest');
// ⚠ 'oc'/'elementum' 只支持 at='latest'，传时间戳会抛 TopicApiError(400)
// board.startTime / board.endTime 可空，渲染前判空
// TS 注意：rank.get 返回 Leaderboard<T> 泛型；entity='stories'→T=StoryCard、'creators'→CreatorCard、'oc'/'elementum'→CharacterCard。
// 严格 TS 下取具体卡片字段时可能需断言，如 const b = await sdk.rank.get('stories','weekly','latest') as Leaderboard<StoryCard>;
```

**可空字段强制判空规则**（grep 现有代码中所有如下字段使用点，确认每处都有判空）：

```
detail.startTime        → 用 `!= null` 才能 * 1000 做日期
detail.endTime          → 同上
detail.title            → 用 ?? 兜底
detail.viewer           → 整体为 null 时匿名态
story.aspect            → style={{ aspectRatio: story.aspect ?? '1 / 1' }}
story.author.uuid       → 用作跳转参数时判空
story.coverUrl          → 渲染 <img> 前判空
char.author.uuid        → 同上
creatorCard.uuid        → 同上
leaderboard.startTime   → 判空后再格式化
leaderboard.endTime     → 同上
```

**自检**：`pnpm dev` + 在浏览器打开，能看到真实话题数据（需要宿主或游客态调通 SDK）。grep `\.uuid` + `.aspect` + `.startTime` 检查每处使用是否有判空，无裸用。

---

### §3.4 外站显示资源本地化

**图片/媒体/字体：**
1. grep 现成 HTML + CSS，找出所有 `src="https://..."` 和 `url('https://...')` 的外站图片/字体/视频/音频。
2. 逐一下载到 `public/assets/` 目录（保留原文件名）。
3. 把 HTML/CSS 里的外站 URL 改为 `/assets/<文件名>`（开发时 vite 会从 `public/` serve，构建后会随产物上传 OSS）。
4. Google Fonts：下载对应的 woff2 文件和 CSS，放入 `public/assets/fonts/`，CSS 中改为本地路径，然后在入口 `import './fonts.css'`。
5. **base64 / `data:` URI 内联的媒体（视频/音频）**：提取 base64 数据，解码为二进制文件，保存到 `public/assets/`，改为相对路径引用。图标 SVG 可保留内联，媒体不行（见 §4 决策树 D4）。

**外站 JS（CDN 引入的库）：**
- 优先方案：`pnpm add <包名>`，把 HTML 里的 `<script src="https://cdn.jsdelivr.net/...">` 删掉，改为 `import` 语句。
- 若无法 npm 化（如私有 CDN、混淆 JS）：必须向运营申请把该域名加入 `script-src` 名单（见 §4 决策树 D3），在 deploy.mjs 的 `buildHtmlCsp` 函数里手动添加该域；否则 CSP 会拦截，**不能上线**。

**自检**：`pnpm build && pnpm preview`，Network 面板无 `net::ERR_BLOCKED_BY_CSP` 报错；页面所有图片/字体/媒体正常显示；无外站资源请求（除了已申请加白名单的 JS CDN）。

---

### §3.5 写按钮处理

**点赞/关注/收藏按钮：**
删除原来调写接口的逻辑，改为：
```typescript
// 跳到原生作品/OC 详情页，在那里完成写操作
sdk.nav.internal('/collection/interaction', { uuid: storyId })
  .catch(() => {}); // 游客态自动转 openApp 深链
```

**分享按钮：**
删除整个按钮及实现。嵌入态的分享由宿主固定浮层提供（顶部导航栏的分享图标），页面不需要也不能触发。游客态无分享按钮；若原来有分享链接，确保分享的链接是 `app.nieta.art/tag?hashtag=X`，不是 OSS URL。

**登录按钮：**
删除原来的登录流程（`localStorage` token、OAuth 跳转等）。嵌入态登录由宿主处理；游客态：
```typescript
if (!sdk.env.embedded) {
  sdk.guest.openApp('/tag', { hashtag }); // 唤起 App 再登录
}
```

**发布/评论/删除等其他写操作：**
整块删除，没有替代（见 §4 决策树 D2）。

**`alert`/自绘弹窗：**
改为 `sdk.ui.toast(text, { level: 'info' })`（仅嵌入态有效，guest 态会抛 `UnsupportedError`；toast 调用前加 `sdk.env.embedded` 判断，guest 降级用 `console.log` 或不提示）。

**自检**：grep `fetch\|XMLHttpRequest\|\.ajax\|localStorage\|sessionStorage\|cookie\|history\.pushState\|overlay\.\|\.pushState` 均无命中（`history.pushState` 已删，token 不落存储）。所有写意图按钮要么改为 `nav.internal`，要么改为 `guest.openApp`，要么删除。

---

### §3.6 三态降级接入

在 SDK 初始化后的入口（`App.tsx` 或 `main.ts`）补充三态降级逻辑：

```typescript
const sdk = await getSdk(); // 见 assets/scaffold/src/sdk.ts

// 读取当前上下文
const isGuest = !sdk.env.embedded;          // guest 裸链
const isAuthenticated = sdk.auth.isAuthenticated(); // 有 embed token

// 数据加载：所有接口匿名也能调（viewer 为 null）
// viewer 为 null 时：不展示"已订阅"状态、不展示个性化数据

// 游客态写意图统一走 openApp
function handleWriteIntent(route: AllowedRoute, query?: Record<string, string | number>) {
  if (isGuest) {
    sdk.guest.openApp(route, query);
  } else {
    // 嵌入态：宿主浮层处理，页面不做任何事（或 toast 引导）
    sdk.ui.toast('请使用顶部入口', { level: 'info' }).catch(() => {});
  }
}
```

**safeBottom + 键盘 inset 处理**（如果页面有底部固定按钮/输入框）：

```typescript
sdk.events.on('viewport', (vp) => {
  document.documentElement.style.setProperty('--safe-bottom', `${vp.safeBottom}px`);
  document.documentElement.style.setProperty('--keyboard-inset', `${vp.keyboardInset}px`);
});
// CSS 里用 padding-bottom: calc(16px + var(--safe-bottom))
// 顶部不加 safeTop（固定为 0，宿主已处理）
```

**自检**：
- 游客态（直接浏览器打开 `pnpm preview` 的 URL）：`sdk.env.embedded === false`，数据正常加载，写意图按钮会唤起 App（或在测试环境触发 alert 提示）。
- 嵌入态（在宿主 webview 里打开）：`sdk.env.embedded === true`，token 3s 内非 null，`getDetail`/`listStories` 正常渲染。

---

### §3.7 多页合并 + 路由改造（仅类型 F）

**第一步:多个 HTML 文件 → 合并成单页(必做,先于路由模式改造)**

现成站点若是多个独立 `.html`(如 `index.html` + `world.html`),**不能各自作为入口部署**,要合并成**一个单页应用**:
- 一个入口 `index.html` + `src/main.tsx`(或 `main.ts`);每个原 `.html` 的 `<body>` 内容 → 一个**视图组件/渲染函数**(如 `IndexView`、`WorldView`)。
- 跨文件跳转 `<a href="./world.html?world=X">` → 改成**切换视图 + hash 传参**:`location.hash = 'world?world=X'`(或路由 `navigate('/world',{world:'X'})`),由下方 hash/内存路由分发到对应视图组件;**删掉裸 `<a href="*.html">`**。
- 各 `.html` 重复的 `<head>`/全局样式**合并去重**;原页内联 `<script>` 逻辑挪进对应视图组件。
- 原 `world.html` 里读 `location.search`(`?world=X`)的逻辑 → 改成从 hash/路由参数读。

合并成单页后,再做下面的**路由模式改造**(浏览器路由 → hash/内存路由)。

**第二步:路由模式改造**

**React Router：**
```typescript
// 改前（禁止）
import { createBrowserRouter } from 'react-router-dom';
const router = createBrowserRouter([...]);

// 改后
import { createHashRouter } from 'react-router-dom'; // hash 路由
const router = createHashRouter([...]);
// 或：createMemoryRouter（纯内存，不改 URL，适合深层内页）
```

**Vue Router：**
```typescript
// 改前（禁止）
createRouter({ history: createWebHistory(), routes })

// 改后
createRouter({ history: createWebHashHistory(), routes })
```

**原生 `history.pushState`：**
全局搜索 `history.pushState`，替换为：
```typescript
// 改前
history.pushState({ page: 'detail' }, '', '/detail');

// 改后（hash 方案）
location.hash = 'detail';
window.addEventListener('hashchange', () => { /* 读 location.hash 切视图 */ });
// 或：内存变量方案
let currentView = 'list';
function navigate(view: string) { currentView = view; renderView(); }
```

**自检**：Android 真机按返回键，不回退 iframe 内历史（因为 hash 变化宿主的返回键能正确处理），页面关闭或回退到上一个 App 页。grep `history\.pushState` 无命中。

---

## 4. 决策树 — 遇到不支持的功能时

### D1：现成 HTML 调的是完全无关的第三方接口（不是话题/作品数据）

**例如**：页面里嵌了一个天气小组件、外部店铺 API、自己的后端。

**默认处理**：
1. 该第三方接口的域名必须加入 CSP `connect-src`（在 `deploy.mjs` 的 `buildHtmlCsp` 函数里追加）。agent 自行修改。
2. 如果该接口返回的内容要用图片展示（外站图床）→ 见 §3.4 资源本地化。
3. 该接口不能持有用户 x-token，不能做写操作，只能纯读/展示。
4. 确认无法去掉该接口依赖后，在 deploy.mjs CSP 里追加该域名，继续改造。

**必须问用户**：「这里有个对外接口 `https://xxx.com/api/...`，请确认：它是你自己的后端服务吗？它不需要用户登录信息，对吗？」

---

### D2：写操作没有替代路径（如发布作品、评论、删除、点赞计数实时更新）

**默认处理**：
1. 删除该写操作按钮/表单及相关逻辑（不能留，CSP 和合规要求）。
2. 如果是"点赞"：改为 `sdk.nav.internal('/collection/interaction', {uuid})` 跳原生作品详情页，在那里点赞。
3. 如果是"发布作品"入口：改为 `sdk.nav.internal('/generate', {})` 跳创作页。
4. 其他写操作（评论、删除、关注）：直接删除，没有话题页内的替代。

**必须问用户**：「原来页面有一个"发评论"/"删除作品"的功能，这个标准内嵌话题页里没法做。你希望：① 删掉这个按钮 ② 点击后跳转到 App 里的对应页面 ③ 别的方案？请用大白话告诉我。」（仅当用户对这个按钮有明确预期时才问；如果是纯装饰性按钮，agent 直接删除。）

---

### D3：外站 JS CDN 无法改为 npm 包

**例如**：`<script src="https://unpkg.com/some-lib@1.0.0/dist/lib.min.js">`，该库没有 npm 版本或有特殊原因必须用 CDN。

**默认处理**：
1. 在改造文档里记录该依赖（不是 agent 要做的文档，是在 `README` 或注释里注明）。
2. 修改 `deploy.mjs` 的 `buildHtmlCsp` 函数，在 `script-src` 里追加该 CDN 域名。
3. **必须向用户说明**（不是技术问题，是安全/合规问题）：「页面使用了来自 `unpkg.com` 的第三方 JS 库，这会放宽安全限制。请确认：① 你信任该 JS 来源 ② 已告知运营审批。如果不确定，我可以帮你把它打包进产物，不走外站 CDN。」

---

### D4：base64 内联媒体（视频/音频/大图）

**references/compliance.md D 项明确禁止** `data:` URI 内联视频/音频。

**默认处理**：
1. 把 base64 数据解码为二进制，保存为文件（`public/assets/video.mp4` 等）。
2. 引用改为 `<video src="/assets/video.mp4">`。
3. **SVG 图标可以保留内联**（COMPLIANCE 不禁止图标 SVG）；只有媒体（视频/音频）和大图（建议 >10KB）才需要提取。

**不问用户**：这是纯技术操作，agent 自行完成。

---

### D5：页面读 `window.parent` 或直接 `postMessage` 到宿主

**默认处理**：全部删除。这会被跨域隔离拦截，且绕过 SDK 的 bridge 协议。如果原来的用途是获取用户信息 → 用 `sdk.auth.getToken()` 代替；如果是导航 → 用 `sdk.nav.internal/external`；其他 → 删除。

**不问用户**：直接删除并记录注释。

---

### D6：页面用了 `localStorage` / `sessionStorage` / `cookie` 存 token

**默认处理**：删除所有对这三个存储的 token 读写操作。embed token 由 SDK 内部管理，在内存中，不需要也不允许页面自己存。如果存的是纯 UI 状态（如用户选中的 tab），可以保留 `localStorage` 用于 UI 偏好（不涉及 token/用户数据），但要确认不存任何鉴权信息。

**不问用户**：删除 token 相关存储，UI 偏好 storage 保留。

---

### D7：页面用了 `<meta name="viewport">` 且值和 scaffold 不同

**默认处理**：强制替换为 scaffold 的值：
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```
`viewport-fit=cover` 是必须的（否则 iOS 安全区会出问题），`user-scalable=no` 防止双指缩放破坏布局。

**不问用户**。

---

## 5. 改造完成后接回 SKILL.md 主流程

改造完成后，从 SKILL.md §3 开始继续：

| SKILL.md 节 | 任务 |
|---|---|
| §3 | 验证 SDK 初始化：三态降级、`tokenTimeout`、`onAuthLost` 降级匿名 |
| §4 | 验证数据渲染：`getDetail`/`listStories` 成功，可空字段均判空 |
| §5 | 验证导航：所有 `nav.internal` 的 route 在 AllowedRoute 白名单内；游客写意图走 `openApp` |
| §6 | 三上下文自测（iOS 真机 / Android 真机 / Web 内嵌 + 游客裸链），逐项过 references/compliance.md F 段 |
| §7 | `pnpm deploy:dry` 干跑预检通过，然后 `pnpm publish` 正式上线 |
| §8 | 逐项过 references/compliance.md A-G 所有红线，任一不过不上线 |

**改造后额外的自检项**（原 scaffold 不需要、迁移才需要）：

```bash
# 1. 确认无 pushState
grep -r "pushState" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.vue"
# 期望：无命中

# 2. 确认无外站显示资源
grep -rE "src=['\"]https://" src/ public/ index.html
# 期望：无命中（oss.talesofai.cn 的图片是允许的，因为 API 返回的 coverUrl 来自那里）

# 3. 确认无 x-token / localStorage token
grep -rE "localStorage|sessionStorage|x-token|setItem.*token|getItem.*token" src/
# 期望：无命中（UI 偏好 storage 除外）

# 4. 确认无 window.parent 直读
grep -r "window\.parent" src/
# 期望：无命中

# 5. 确认无写接口调用
grep -rE "POST|PUT|DELETE|PATCH" src/ --include="*.ts" --include="*.tsx"
# 期望：无命中（fetch/axios 写操作全删，nav.internal 跳转不是写操作）

# 6. 确认 CSP meta 已删
grep -r "Content-Security-Policy" index.html
# 期望：无命中
```

---

## 附录：常见迁移场景速查

### 老 jQuery 页面迁入

- jQuery 改为 `pnpm add jquery` + `import $ from 'jquery'`，或直接改用原生 DOM API。
- `$.ajax` 全部替换为 SDK 数据调用（§3.3）。
- vite.config.ts 去掉 `react()` plugin。
- 入口 `src/main.ts`（非 tsx），内容就是原 jQuery 的初始化逻辑。
- jQuery 的 `$(document).ready` 改为直接调 `createTopicSDK()`（Promise 化的异步初始化）。
- 注意：SDK 是 ESM，jQuery 老代码如果用 `require()` 需要改为 `import`，或在 `vite.config.ts` 加 `commonjsOptions`。

### Vue 2 老页面迁入

- Vue 2 与 scaffold 不兼容（vite plugin 只支持 Vue 3）。**必须先升级到 Vue 3**，或重写为 React。
- 升级复杂度高时，推荐重写为 React（App.tsx 模板已有）。

### 有 iframe 嵌套的页面

- 话题页本身就是 iframe，里面**不允许**再嵌 iframe（CSP `frame-src 'none'`，宿主默认限制）。删掉内部 iframe，改为 SDK 数据渲染。

### 有 Service Worker 的 PWA 页面

- Service Worker 无法在跨域 iframe 内注册（scope 问题）。删掉 Service Worker 注册代码（`navigator.serviceWorker.register(...)`），不问用户直接删。
