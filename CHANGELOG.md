# @talesofai/topic-sdk

## 0.1.0

### Minor Changes

- 首个版本。提供 `createTopicSDK` 运行时：端探测与三态降级（app / web-embedded / guest）、只读数据接口（`sdk.topic` / `sdk.activity` / `sdk.rank`，对接 `/v1/embed/*`）、frame-bridge v2 通信、鉴权（60 天无状态 embed token，过期由 `expiresAt` 临近 + `tokenChanged` 驱动 re-exchange）、导航（`nav.internal` AllowedRoute 白名单 / `nav.external`）、游客唤起 App、`ui.toast` / `ui.viewport` / 事件订阅。
- 契约与已部署后端对齐：`viewer` 仅 `{ subscribed, canEdit }`；`Leaderboard.startTime/endTime`、`StoryCard.aspect`、`*.author.uuid`、`CreatorCard.uuid` 等可空；`parentType: string[]`；`oc`/`elementum` 榜单仅 `at='latest'`。
- 附带 `skill/`：Claude Code 创作者引导 skill（SKILL.md + 合规 checklist + 离线 API 速查 + vite/react 脚手架）。
