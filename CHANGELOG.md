# @talesofai/topic-sdk

## 0.1.0-dev.0

### Minor Changes

- 首个版本。提供 `createTopicSDK` 运行时：端探测与三态降级（app / web-embedded / guest——guest 仅本地 dev 无宿主可达，生产入口恒为宿主内嵌）、只读数据接口（`sdk.topic` / `sdk.activity` / `sdk.rank`，对接 `/v1/embed/*`）、frame-bridge v2 通信、鉴权（60 天无状态 embed token，过期由 `expiresAt` 临近 + `tokenChanged` 驱动 re-exchange）、`ui.toast` / `ui.viewport` / 事件订阅。
- 导航统一漏斗 `sdk.nav.internal`（AllowedRoute 白名单 / `nav.external`）：写意图一律经此跳产品内页——原生 App 站内跳、手机浏览器自动唤起 App、桌面站内跳；**无公开 `guest.openApp`、无写方法**。参数兜底：自指路由（`/topic`/`/tag`/`/activity`）从当前页 URL 自动填，per-item 路由（`/oc`/`/user`/`/collection/interaction`）必传 `uuid`（构建期类型收窄 + 运行期校验，缺参报错打回，不静默白屏）。
- 运行期防护：原生 `<a>` 点击全局拦截改走 bridge（不逃逸 OSS 源）、`history.pushState/replaceState` 在嵌入态禁用、`tokenTimeout` < 1000ms 自动 clamp。
- 契约与已部署后端对齐：`viewer` 仅 `{ subscribed, canEdit }`；`Leaderboard.startTime/endTime`、`StoryCard.aspect`、`*.author.uuid`、`CreatorCard.uuid` 等可空；`parentType: string[]`；`oc`/`elementum` 榜单仅 `at='latest'`。
- 附带 `skill/`：Claude Code 创作者引导 skill（SKILL.md + 合规 checklist + 离线 API 速查 + vite/react 脚手架）。
- 新增 `sdk.nav.applyHost()`：承载「申请创建话题活动空间」跳转（飞书表单）。**不接受参数**——当前话题名/用户昵称/UID 全由宿主本地态直接拼 prefill URL，SDK/页面拿不到这些字段；运营未配置申请表单时抛 `BridgeError`。`sdk.nav.internal('/tag'|'/topic', { hashtag })` 显式传参即可跳到另一个话题活动空间（复用既有自指路由覆盖语义，非新增能力）。
