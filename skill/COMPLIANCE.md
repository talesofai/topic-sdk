# 上线合规红线 checklist

上线前**逐项确认**。任一项不过，停下来报告用户，**不要上线**。

## A. 数据只读 / 鉴权
- [ ] 页面内**不含任何写接口调用**（点赞/收藏/关注/发布/删除/评论等）。
- [ ] 只持 `embed token`（`token_type='embed'`）；**不持、不存储、不传递**用户的 `x-token`。
- [ ] embed token **不写入** `localStorage` / `sessionStorage` / `cookie`（内存持有即可）。
- [ ] `onAuthLost` / token 为 null 时降级匿名展示，**不抛错、不阻塞渲染**。

## B. 写动作（D9 铁律）
- [ ] 页面**不绘制也不调用**任何写动作浮层；SDK 无 `overlay.*` 方法，未尝试调用。
- [ ] 分享/登录/举报依赖**宿主固定浮层**；分享的是规范链 `app.nieta.art/tag?hashtag=X`。
- [ ] per-item 写（点赞/关注/收藏）通过 `sdk.nav.internal('/collection/interaction', {uuid})` 跳原生页完成，未在页面内尝试提交。
- [ ] 提示统一用 `sdk.ui.toast(...)`，不用 `alert`/自绘 DOM（会被宿主浮层遮盖）。

## C. URL 规范
- [ ] 分享链接用 `app.nieta.art/tag?hashtag=X` 或 `t.nieta.art/<code>`，**绝不暴露 OSS URL**。
- [ ] 页面内无 `oss.talesofai.cn` 的可见引用（`<a href>` / 分享 / 文案）。

## D. 外站静态显示资源禁止（CSP 落地）
- [ ] 所有**图片**来自 `oss.talesofai.cn` 或打包进同一 OSS 路径，不引外站图床。
- [ ] 所有**媒体**（视频/音频）来自允许域，不引外站媒体服务。
- [ ] 所有**字体**打包内联或来自 `oss.talesofai.cn`，不引 Google Fonts 等外站。
- [ ] 所有 **CSS** 打包内联，无 `<link rel="stylesheet" href="外站">`。
- [ ] **禁止 base64 / `data:` URI 嵌入媒体**（图片/视频/音频）；小图标用内联 SVG 组件。
- [ ] 如用外站 CDN 加载 **JS**，已向运营申请加入 `script-src` 名单；未引来源不明的第三方 JS（供应链风险）。

## E. 运行时约束
- [ ] **禁用 `history.pushState`**；用 hash 路由（`createHashRouter`）或内存路由（`createMemoryRouter`）。
- [ ] 页面顶部**不加** `safeTop`/Navbar 内边距（`sdk.ui.viewport().safeTop` 固定 0，宿主已占）。
- [ ] 所有可空字段（`*.author.uuid` / `StoryCard.aspect` / `Leaderboard.startTime/endTime` / `TopicDetail.startTime/endTime` / `viewer`）渲染前已判空。
- [ ] 页面**不读** `window.parent` DOM/storage（跨域隔离），**不直接** `window.parent.postMessage`（只经 SDK 调 bridge）。
- [ ] 所有外部请求均为 HTTPS，无 HTTP 明文。

## F. 三上下文功能自测（iOS 真机 / Android 真机 / Web 内嵌 + 游客裸链）
- [ ] **iOS**：iframe 能加载；`sdk.env` 为 `embedded=true, client='ios'`；token 3s 内非 null；`getDetail`/`listStories` 正常；`nav.internal` 跳转正常；宿主 Navbar 与内容无重叠；底部安全区正确；宿主弹窗覆盖时页面能容忍；深链从 Safari 打开 `app.nieta.art/tag?hashtag=X` 落到 App 正确路由。
- [ ] **Android**：同上前若干项；返回键**不**回退 iframe 内 history（已禁 pushState）；OSS 资产加载正常。
- [ ] **Web 内嵌**：`embedded=true`，功能同上。
- [ ] **Web 游客裸链**：`embedded=false`，匿名数据正常、`viewer` 为 null；写动作走 `sdk.guest.openApp` 唤起 App；微信/QQ 内置浏览器弹引导（非直接 scheme）。

## G. 上传 / OSS
- [ ] 两段式上传：资产长缓存、HTML 禁缓存 + 上传管线 `--headers` 注入 CSP（非 HTML `<meta>` 自设）。
- [ ] 用 STS scoped token（限 `static/topic/<uuid>/`），**未用**永久 AK。
- [ ] OSS 域（`oss.talesofai.cn`）已由运营/后端加入宿主 origin 白名单。

> **诚实 caveat**：CSP 同时允许"外站 JS"+"对外数据连接"时，"禁外站显示内容"只能 best-effort（外站 JS 可 fetch 字节再 canvas 画出绕过）。这是结构性缺口，靠"页面可下架"兜底。
