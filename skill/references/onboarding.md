# 运营/产品同事上手指南（内嵌话题页）

> 给**非技术的运营/产品同事**做自定义内嵌话题页用。核心理念:**同事不需要懂技术**——环境配好后,在 Claude Code 里对着 skill 说一句话(「我要做内嵌话题页」或「我有个现成 HTML 想改造成话题页」),AI agent 会全程代劳脚手架/改造/开发/自测/上线,**不问技术问题**(技术取舍 agent 自己按规范默认)。
>
> 本文分三部分:**A. 管理员(你)一次性配的** / **B. 同事本地装什么 + 怎么用** / **C. 上线后管理**。
>
> **诚实边界**:agent 全程代劳的只是"**开发 / 改造 / 上线脚本**"那一段。A 的配置(GitHub 权限、本人 token、活动后台拿 uuid)和 C 的上线后管理(查/换版/下线)是**接口与权限操作**,需要你(管理员)或技术同学配合——不是非技术同事点一下就全自动。心里有数。

---

## A. 管理员(你)一次性帮同事配齐(三件)

### A1. GitHub 访问权(装 SDK 的前提)
SDK `@talesofai/topic-sdk` 走 **GitHub 私有仓库 git 源**安装(不发 npm)。同事的机器要能 `git clone` 到 `talesofai/topic-sdk`,二选一:
- 把同事加进 `talesofai` GitHub org(或单独给 `talesofai/topic-sdk` 仓库 **read** 权);**或**
- 给他一个对该仓库有 read 权的 GitHub token,配进他机器的 git 凭据(`git config --global credential.helper` / 或 `~/.git-credentials`)。

> 自检:同事机器上 `git ls-remote https://github.com/talesofai/topic-sdk.git` 能列出引用 = 权限 OK。

### A2. `.env` 三件套(上线脚本要用)
让同事在项目里填 `.env`(从 `.env.example` 复制),三个值:
| 变量 | 是什么 | 怎么拿 |
|---|---|---|
| `NIETA_API_TOKEN` | **同事本人**登录 nieta-app 后的 API token(**必须本人,不能借用别人的**) | 电脑浏览器登录 `app.nieta.art` → 按 `F12` 开发者工具 → `Network/网络` 标签 → 刷新页面 → 点任意一条发往 api 的请求 → 在 `Headers/请求头` 里找 **`x-token`**,复制它的值(就是 `x-token` 这个头,不是别的)。保密、不提交。拿不准就让你或技术同学帮取一次。 |
| `NIETA_ACTIVITY_UUID` | 这个话题对应**活动(activity)的 uuid** | 在你们**现有的活动后台/运营工具**里创建或找到该活动,它的 uuid 就是(活动由内部活动接口 `POST /activities` 创建)。**要求**:活动须 `PUBLISHED`,且操作者是它的 **creator** / 在 `hashtags.edit_whitelist` 运营白名单 / 是内部员工(`is_internal`)——三者之一才有管理权,否则 `upload-grant`/`publish` 返回 403。 |
| `NIETA_API_BASE` | 后端基址 | 正式 `https://api.talesofai.cn`(联调期可用 pre)。 |

### A3. 后端/运维侧就绪(否则上线后内嵌页加载/桥接失败)
- 确认后端已部署含 `upload-grant` 与 `topic-embed` 接口的版本。
- 确认运维已把 **OSS 域**(如 `oss.talesofai.cn`)+ `https://app.nieta.art` + `capacitor://app.nieta.art` 加进宿主 `origin-whitelist`(KV 配置),否则内嵌页与宿主的通信(登录/跳转/键盘适配)会被宿主拒绝。

---

## B. 同事本地要装什么 + 怎么用

### B1. 装环境(一次性)
1. **Node ≥ 18、pnpm ≥ 8**。
2. **Claude Code**(装好并能用)。
3. **拿到 skill**:`git clone https://github.com/talesofai/topic-sdk.git`,把里面的 `skill/` 目录拷进 Claude Code 技能目录,例如:
   - 项目级:在工作目录下 `.claude/skills/nieta-topic-page/`(把 `skill/` 内容放进去);**或**
   - 直接在 clone 下来的 `topic-sdk/` 里用 Claude Code(skill 已在 `skill/`)。

> **SDK 不用手动装**:脚手架项目的 `package.json` 已经把 SDK 写成 git 依赖,agent 跑 `pnpm install` 时自动拉取(已含预构建产物,零额外步骤)。只要 A1 的 GitHub 权限给到位即可。

### B2. 怎么用(对着 skill 说话即可)
在 Claude Code 里触发这个 skill(说「自定义话题页」/「内嵌话题页」/「我有个现成 HTML 想改造成话题页」),agent 会:
1. 帮你起脚手架(或把你现成的 HTML 改造成标准结构);
2. 用**大白话**问你要必要信息(话题 uuid、你的 token、某按钮点了想跳哪个站内页、要展示哪些榜单/作品);
3. 自己写代码、接好数据、做好三种环境(App 内 / 网页版 / 浏览器游客)兼容;
4. 自测;
5. 一条命令上线(`pnpm publish` = 自动换取上传凭证 → 构建 → 上传 OSS → 绑定到话题)。

技术取舍(缓存、CSP、安全白名单、构建配置等)**agent 全部按规范默认,不会拿这些问你**。

### B3. 已经有现成 HTML?
直接对 agent 说「我有个现成 HTML 想改造成话题页」,把 HTML 文件(或目录)给它。agent 会按 `skill/references/migrate-existing-html.md` 评估可行性并改造:大多数**纯展示类**页面能平滑迁入;**页面内的写操作**(点赞/发布等)会被改成跳原生页或交给宿主浮层;**外站图片/字体等显示资源**会被打包进产物;用了 `pushState` 多页路由的会改成内存/hash 路由。

---

## C. 上线后管理(查 / 换版 / 下线;**无管理 UI,走接口**)

> 上线后的管理也走接口(目前不做管理 UI)。鉴权同上:带你本人 `x-token`、且对该活动有管理权(creator / 运营白名单 / 内部员工)。`<base>`=API 基址,`<uuid>`=activity uuid;联调期(pre)所有请求另加头 `x-develop-pass: 1`。非技术同事可让 agent 代发这些请求。

- **查当前绑定 + 历史版本**:`GET <base>/v1/topic-embed/activities/<uuid>/embed-page/versions` → 返回 `{enabled, active_version, versions[]}`。
- **回滚 / 切到某历史版本**(无需重传):`POST <base>/v1/topic-embed/activities/<uuid>/embed-page/activate`,body `{"version": N}`(N 必须在 versions 里且其 OSS 目录还在)。
- **下线内嵌页**(`/tag` 回落原生话题页,版本记录保留可再启用):`POST <base>/v1/topic-embed/activities/<uuid>/embed-page/unbind`。
- **发新版本**:重跑 `pnpm publish`,deploy 脚本自增版本号并自动绑为新生效版;超出保留上限(默认 5 个)的旧版本 OSS 目录会被清理。

> 多话题各自独立(一个活动一份绑定),没有批量接口;权限按"每个活动各自的 creator/白名单 + 全体内部员工"判定。

## 常见报错速查(同事遇到可对 agent 说,agent 会处理)
| 现象 | 多半原因 |
|---|---|
| `pnpm install` 拉 topic-sdk 失败(权限/404) | A1 的 GitHub 访问权没给够 |
| 上线时 `upload-grant` 返回 403 | token 不是本人 / 同事对该话题无权限 / activity 不是 PUBLISHED(见 A2) |
| 页面上线后在 App 里点登录/跳转没反应 | 运维没把 OSS 域加进 `origin-whitelist`(见 A3) |
| 上线时 `publish` 报 `missing index.html` | 构建没产出入口文件(agent 会重跑构建排查) |
