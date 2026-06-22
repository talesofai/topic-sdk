# 运营/产品同事上手指南（内嵌话题页）

> 给**非技术的运营/产品同事**做自定义内嵌话题页用。核心理念:**同事不需要懂技术**——环境配好后,在 Claude Code 里对着 skill 说一句话(「我要做内嵌话题页」或「我有个现成 HTML 想改造成话题页」),AI agent 会全程代劳脚手架/改造/开发/自测,**不问技术问题**(技术取舍 agent 自己按规范默认)。开发完成后,将项目源码交内部团队发布上线。
>
> 本文分三部分:**A. 管理员(你)一次性配的** / **B. 同事本地装什么 + 怎么用** / **C. 上线后管理**。
>
> **诚实边界**:agent 全程代劳的只是"**开发 / 改造**"那一段。A 的配置(活动后台拿 uuid 供本地自测)和 C 的上线后管理(查/换版/下线)是**接口与权限操作**,需要内部技术同学配合——不是非技术同事点一下就全自动。心里有数。

---

## A. 管理员(你)一次性帮同事配齐

### A1. SDK 安装说明

`@talesofai/topic-sdk` 是**公开仓库**（`github.com/talesofai/topic-sdk`），走 git 源安装（不发 npm），任何人免认证可装，无需特殊 GitHub 权限。`pnpm install` 时 clone 仓库并直接使用其中已提交的预构建 `dist/`，**无构建脚本、零摩擦**。

> 自检：同事机器上 `git ls-remote https://github.com/talesofai/topic-sdk.git` 能列出引用 = 网络 OK。

### A2. 活动 UUID（本地自测用）

若同事需要在本地 dev 下自测真实数据，需提供该话题对应的 `activity_uuid`：
- 在**现有的活动后台/运营工具**里找到该活动的 uuid。
- **本地 dev 自测不需要上传权限**，只需 uuid 供 vite proxy 代理拿数据。

> 上线相关凭据（`NIETA_API_TOKEN`、OSS 操作）由内部团队持有，不经过创作者。

### A3. 后端/运维侧就绪(否则上线后内嵌页加载/桥接失败)
- 确认后端已部署含 `upload-grant` 与 `topic-embed` 接口的版本。
- 确认运维已把 **OSS 域**(如 `oss.talesofai.cn`)+ `https://app.nieta.art` + `capacitor://app.nieta.art` 加进宿主 `origin-whitelist`(KV 配置),否则内嵌页与宿主的通信(登录/跳转/键盘适配)会被宿主拒绝。

---

## B. 同事本地要装什么 + 怎么用

> **发布模型(权限分级,后端强制)**:
> - **创作者(你/同事)→ 只能发草稿(dev)**:用 dev 开发令牌 + `pnpm deploy:dev` 发草稿(不上线),在 app 内用开发者菜单挑版本真机调试;满意后把项目源码交内部团队上线。**创作者永不能 prod(上线)。**
> - **内部用户(`is_internal`)→ 可 prod + dev**:用完整登录态 `pnpm deploy:prod` 上线,也可发 dev 草稿。后端对 prod/activate/unbind 只认 `is_internal` 完整登录态,dev 令牌请求这些动作会被拒(403)。
>
> **怎么拿 dev 开发令牌**:用你自己的账号登录 nieta-app → 进入**该话题页** → 点右上角**「⋯」→「开发者菜单」→「生成开发令牌」**(令牌入口在话题页顶栏的开发者菜单里,**不在账号设置**)。令牌**绑定你正在操作的这个话题活动**:只有该活动的创作者/内部用户能签,且签出的令牌只能给这个活动发草稿(7 天有效,过期重新生成);换话题要进对应话题页重新生成。这串令牌是 scoped dev 令牌,**不是**你的完整登录 token,把它(而非账号密码/x-token)交给 agent 填进 `.env` 的 `NIETA_DEV_PUBLISH_TOKEN`。

### B1. 装环境(一次性)
1. **Node ≥ 18、pnpm ≥ 8**。
2. **Claude Code**(装好并能用)。
3. **拿到 skill**:`git clone https://github.com/talesofai/topic-sdk.git`,把里面的 `skill/` 目录拷进 Claude Code 技能目录,例如:
   - 项目级:在工作目录下 `.claude/skills/nieta-topic-page/`(把 `skill/` 内容放进去);**或**
   - 直接在 clone 下来的 `topic-sdk/` 里用 Claude Code(skill 已在 `skill/`)。

> **SDK 不用手动装**:脚手架项目的 `package.json` 已经把 SDK 写成 git 依赖，agent 跑 `pnpm install` 时自动拉取（仓库公开，无需权限）。

### B2. 怎么用(对着 skill 说话即可)
在 Claude Code 里触发这个 skill(说「自定义话题页」/「内嵌话题页」/「我有个现成 HTML 想改造成话题页」),agent 会:
1. 帮你起脚手架(或把你现成的 HTML 改造成标准结构);
2. 用**大白话**问你要必要信息(话题的 `activity_uuid`——本地预览和 dev 发草稿都要用、dev 开发令牌、某按钮点了想跳哪个站内页、要展示哪些榜单/作品);
3. 自己写代码、接好数据、做好三种环境(App 内 / 网页版 / 浏览器游客)兼容;
4. 本地自测（`pnpm dev` 预览）;
5. 用你给的 dev 开发令牌跑 `pnpm deploy:dev` 发**草稿**(不上线),你在 app 内话题页「⋯」→「开发者菜单」选这个版本做真机调试,不满意就让 agent 改了重发,循环到满意;
6. 产出项目源码，**交给内部团队**发布上线(创作者只能 dev,上线由内部用 `pnpm deploy:prod` 完成)。

技术取舍(缓存、CSP、安全白名单、构建配置等)**agent 全部按规范默认,不会拿这些问你**。

### B3. 已经有现成 HTML?
直接对 agent 说「我有个现成 HTML 想改造成话题页」,把 HTML 文件(或目录)给它。agent 会按 `skill/references/migrate-existing-html.md` 评估可行性并改造:大多数**纯展示类**页面能平滑迁入;**页面内的写操作**(点赞/发布等)会被改成跳原生页或交给宿主浮层;**外站图片/字体等显示资源**会被打包进产物;用了 `pushState` 多页路由的会改成内存/hash 路由。

---

## C. 上线后管理(查 / 换版 / 下线;**走内部接口**)

> 上线后的管理走接口（目前不做管理 UI）。鉴权：带**内部员工（`is_internal`）**的 bearer token，且对该活动有管理权。`<base>`=API 基址，`<uuid>`=activity uuid；联调期（pre）所有请求另加头 `x-develop-pass: 1`。非技术同事可让 agent 代发这些请求（需内部账号凭据）。

- **查当前绑定 + 历史版本**:`GET <base>/v1/topic-embed/activities/<uuid>/embed-page/versions` → 返回 `{enabled, active_version, versions[]}`。
- **回滚 / 切到某历史版本**(无需重传):`POST <base>/v1/topic-embed/activities/<uuid>/embed-page/activate`,body `{"version": N}`(N 必须在 versions 里且其 OSS 目录还在)。
- **下线内嵌页**(`/tag` 回落原生话题页,版本记录保留可再启用):`POST <base>/v1/topic-embed/activities/<uuid>/embed-page/unbind`。
- **发新版本**:重跑 `pnpm deploy:prod`（内部团队在发布项目里执行），deploy 脚本自增版本号并自动绑为新生效版;超出保留上限(默认 5 个)的旧版本 OSS 目录会被清理。

> 多话题各自独立(一个活动一份绑定),没有批量接口;发布权限仅限内部员工（`is_internal`）。

## 常见报错速查(同事遇到可对 agent 说,agent 会处理)
| 现象 | 多半原因 |
|---|---|
| `pnpm install` 拉 topic-sdk 失败（网络错误） | 网络问题，检查 `git ls-remote https://github.com/talesofai/topic-sdk.git` 是否通 |
| 上线时 `upload-grant` 返回 403 | 操作者账号不是 `is_internal` / activity 不是 PUBLISHED（见内部发布 runbook） |
| 页面上线后在 App 里点登录/跳转没反应 | 运维没把 OSS 域加进 `origin-whitelist`(见 A3) |
| 上线时 `publish` 报 `missing index.html` | 构建没产出入口文件(内部团队排查构建输出) |
