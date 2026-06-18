---
name: nieta-topic-page-publish
description: >-
  内部运营把创作者交付并已通过 dev 调试的自定义内嵌话题页项目上线（target=prod）到 OSS
  并激活绑定话题，或对已有草稿版本执行 activate/unbind。Use this when an internal operator
  (is_internal) receives a creator's topic-page source project (already
  dev-published and debugged) and needs to run deploy:prod / activate / unbind
  to make it live on nieta-app. Triggers: "发布话题页", "上线内嵌页", "deploy topic page",
  "上传 OSS 并绑定话题", "topic-page publish", "activate embed page", "下线话题页".
is_internal: true
---

# nieta-app 内嵌话题页 — 内部上线 runbook

本 runbook 供**内部运营（`is_internal` 账号）**使用。创作者完成开发、发草稿并完成 dev 真机调试后，由内部团队执行本流程将页面正式上线（激活）。

> **权限说明**：`target=prod`（上线）/ `activate`（切换已有草稿为 active）/ `unbind`（下线）仅允许 `is_internal` 完整登录态，scoped dev 令牌和创作者账号会被后端直接拒绝（403）。请务必使用**内部有权限的账号**（`is_internal=true`）。

---

## 1. 前置条件

取得两样内部凭据：

1. **`NIETA_API_TOKEN`**：**内部运营自己**登录 nieta-app 后的完整登录态 token（**必须是 `is_internal` 账号，不得使用创作者或他人 token**）。鉴权头：`x-token`。
2. **`NIETA_ACTIVITY_UUID`**：平台分配给本话题的 `activity_uuid`。
3. **`NIETA_API_BASE`**：后端基址，正式 `https://api.talesofai.cn`。

环境：Node >= 18、pnpm >= 8。

---

## 2. 拿到创作者交付的项目

创作者交付条件：
- 能本地 `pnpm dev` 预览；
- 已用 `pnpm deploy:dev` 发过草稿；
- 已在 app 内开发者菜单用真实 embed 上下文完成调试；
- 通过合规自测（`references/compliance.md`）。

交付物：项目源码（不含 `node_modules/`、`dist/`）。

---

## 3. 配置 .env

创作者项目根目录已有 `.env.example`（来自 `skill/assets/scaffold/.env.example`）。复制并填入内部凭据：

```bash
cp .env.example .env
# 编辑 .env：
# NIETA_API_TOKEN=<is_internal 账号的完整 token>
# NIETA_ACTIVITY_UUID=<activity uuid>
# NIETA_API_BASE=https://api.talesofai.cn
```

`.env` 不提交 git。

> **注意**：dev 令牌字段（`NIETA_DEV_PUBLISH_TOKEN`）可忽略，prod 模式不读取。

---

## 4. 安装依赖

```bash
pnpm install
```

SDK `@talesofai/topic-sdk` 是**公开仓库**，git 源安装，任何人免认证可装。`ali-oss` 从 npmjs 公共仓库安装。

---

## 5. 预检（推荐先跑）

```bash
pnpm deploy:dry
# 等价于：node scripts/deploy.mjs --dry-run（默认 target=dev，dry-run 时不影响）
```

确认 `.env` 凭据读取正常、构建产出 `dist/index.html`、后缀/大小符合白名单。

---

## 6. 构建 + 上传 + 上线（正式）

```bash
pnpm deploy:prod
# 等价于：node scripts/deploy.mjs --target prod
```

脚本流程（与 dev 模式相同流程，仅鉴权头和 publish target 不同）：

1. **upload-grant**：`GET /v1/oss/upload-grant?purpose=topic_embed_page&activity_uuid=<uuid>`，鉴权头 `x-token: <NIETA_API_TOKEN>`，拿到 `version` + 临时 STS + `prefix` + `base_url`。打印 `version`。
2. **build**：`VITE_OSS_BASE=base_url pnpm exec vite build`。
3. **本地预检**：确认 `dist/index.html` 存在；后缀白名单 + 单文件大小。
4. **两段式上传**（`ali-oss`，带 `stsToken`）：
   - 非 HTML：长缓存 `max-age=31536000`。
   - HTML：禁缓存 + CSP（对象 header，不靠 `<meta>`）。
5. **publish（上线）**：`POST .../embed-page/publish` body `{ version, target: "prod" }`（鉴权头 `x-token`）。后端校验 prefix/index.html 存在后**激活**（设 `activeVersion` + `enabled=true`）并绑定话题。
6. **断言**：`active_version` 必须与 grant 的 `version` 一致。

**校验门**：publish 成功后 `active_version` 与本次 `version` 一致；`enabled=true`；`/tag?hashtag=X` 公众路径已挂载新版本。

---

## 7. 上线后管理（查 / 换版 / 下线）

> 鉴权：带 `is_internal` 账号的完整 token（`x-token` 头），且 activity `PUBLISHED`。

- **查当前绑定 + 历史版本**：`GET <base>/v1/topic-embed/activities/<uuid>/embed-page/versions` → `{enabled, active_version, versions[]}`。
- **切换到已有草稿版本**（无需重传）：`POST .../embed-page/activate` body `{"version": N}`（N 须在 versions[] 里且 OSS 目录仍在）。
- **下线内嵌页**（`/tag` 回落原生页，版本记录保留可再启用）：`POST .../embed-page/unbind`。
- **发新版本**：重跑 `pnpm deploy:prod`，脚本自增版本并自动激活；超出保留上限（默认 5 个）的旧版本 OSS 目录会被清理。

---

## deploy.mjs 位置说明

发布脚本 `scripts/deploy.mjs` 来自创作者项目自带（由 `skill/assets/scaffold/scripts/deploy.mjs` 提供）。内部面**不再单独维护 deploy.mjs**，直接使用创作者项目里的那份，传 `--target prod` 即可。

---

## 常见报错速查

| 现象 | 多半原因 |
|---|---|
| `upload-grant` 返回 403 | `NIETA_API_TOKEN` 不是 `is_internal` 账号 / activity 不是 PUBLISHED |
| `publish` 报 `missing index.html` | 构建没产出入口文件（检查 `pnpm exec vite build` 输出） |
| 上传途中 403 | STS 有效期仅 1h，文件数过多（>800）超时；建议精简产物 |
| `publish target=prod` 返回 403 | 误用了 `NIETA_DEV_PUBLISH_TOKEN`（scoped dev 令牌）；prod 仅接受 `x-token` |
| 页面上线后在 App 里跳转没反应 | 运维没把 OSS 域加进 `origin-whitelist`（KV 配置） |
