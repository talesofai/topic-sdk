# @talesofai/topic-sdk

给有资质的**创作者 / 运营**(或照着配套 skill 工作的 AI agent)用来开发 **nieta-app 自定义话题页**的运行时 SDK。

---

## 这是什么 · 能干什么(一句话:给话题/活动页"换皮")

让有资质的运营/创作者做一个**自定义网页**,挂到某个**话题或活动**上;用户在 App 里打开这个话题页时,看到的就是这张**定制页**,而不是默认样式。

- **自定义外观**:活动/话题页可做成任意风格的专属页面(活动落地页、专题、玩法介绍…),不必每个都找研发单独开发。
- **自动展示真实数据**:页面里能放这个话题的**作品、角色、榜单、活动精选、世界观**等,数据自动从 nieta 后端读,无需人工填。
- **多版本 + 随时切换**:支持草稿 / 正式 / 回滚,可随时换一版皮或一键下线(回落默认原生话题页),改页面不用发版。
- **三端都能看**:App 内(iOS/安卓)、手机浏览器、电脑浏览器都适配;手机浏览器里用户想点赞/关注会**自动引导打开 App**。

### 安全边界(运营对外可讲)

- 定制页**只能展示、不能改数据**。用户要点赞/关注/创作 → 自动跳进 App 里完成,页面本身碰不到用户账号。
- 分享出去的链接是规范的 `app.nieta.art` 链,**不暴露任何内部地址**。
- 上线前有一整套**机器红线检查**(禁外部脚本、禁存用户凭证、禁写操作…),不过不让发。

> 技术上:你的页面打包上传到 OSS,由 nieta-app 在 `/tag?hashtag=X` 路由内以**沙箱 iframe** 内嵌。SDK 负责端探测与三态降级、只读数据接口(`/v1/embed/*`)、frame-bridge v2 通信、导航漏斗。**SDK 不暴露任何写方法**——读 + 跳转,写永远在原生 App 里发生。

---

## 给创作者 / 开发者

### 安装

本包**公开仓库、免认证**,从 git 源安装(**不发 npm registry**):

```bash
pnpm add git+https://github.com/talesofai/topic-sdk.git
```

> 仓库已提交预构建的 `dist/`,`pnpm add` 直接可用,**无需本地构建**(git 依赖默认不执行 build 脚本,无需 `onlyBuiltDependencies` 放行)。

### 快速开始

```ts
import { createTopicSDK } from "@talesofai/topic-sdk";

const sdk = await createTopicSDK({
  tokenTimeout: 3000, // 默认 3000,勿设更小(v1 bridge 历史坏值)
  onAuthLost: () => {
    /* 只做匿名降级,不抛错、不阻塞渲染 */
  },
});

// 话题名由宿主经 ?hashtag= 注入(对外 URL 仍是 app.nieta.art/tag?hashtag=X)
const hashtag = new URLSearchParams(location.search).get("hashtag") ?? "";

const detail = await sdk.topic.getDetail(hashtag);
const page = await sdk.topic.listStories(hashtag, { pageIndex: 0, pageSize: 20, sort: "hot" });
```

### 核心概念

- **三种运行上下文**:`app`(原生 App 内嵌) / `web-embedded`(浏览器内嵌,手机/桌面) / `guest`(无宿主,仅本地 `pnpm dev` 自测可达——生产入口恒为宿主内嵌)。`sdk.env` 自动探测,数据接口在任意上下文均可调(无 token 时匿名返回 `viewer=null`,不报错)。
- **只读 + 导航漏斗**:数据接口(`sdk.topic` / `sdk.activity` / `sdk.rank`)全只读;一切"写意图"统一走 **`sdk.nav.internal(route, query?)`** 跳产品内页——原生 App 内站内跳、手机浏览器里**自动唤起 App**、桌面站内跳。**没有 `guest.openApp`,没有写方法。** 跳别的话题活动空间也走它:`sdk.nav.internal('/tag', { hashtag })` 显式传参即覆盖当前话题。另有 `sdk.nav.applyHost()` 承载"申请创建话题活动空间"跳转(飞书表单,宿主本地拼 prefill,页面不经手用户数据)。
- **nav.internal 参数兜底**(传错/漏传不会再静默白屏):
  - **自指路由** `/topic` `/tag` `/activity`:参数可省,SDK 从当前页 `?hashtag=`/`?activity_uuid=` 自动填(可覆盖)。
  - **per-item 路由** `/oc` `/user` `/collection/interaction`:必须传 `uuid`(来自被点卡片),漏传**构建期类型 + 运行期都会报错打回**。
- **可空字段**:`detail.startTime/endTime/title`、`StoryCard.aspect`、`*.author.uuid`、`Leaderboard.startTime/endTime` 等均可能为 `null`,渲染前判空(详见 cheatsheet)。

完整契约、AllowedRoute 白名单与参数表、错误模型、三态降级见配套 skill 的 `references/api-cheatsheet.md`。

---

## 配套 skill

### `skill/` —— 创作者引导(强烈推荐)

一个 **Claude Code skill**:装进 Claude Code(`.claude/skills/`),让 agent 引导你从零脚手架、开发、自测、构建、上传 OSS,并逐项过合规红线。

- `SKILL.md` —— agent 执行工作流(含校验门)
- `references/compliance.md` —— 上线红线 checklist
- `references/api-cheatsheet.md` —— 离线 API / 契约速查(含 nav 参数表)
- `references/migrate-existing-html.md` —— 把现成 HTML 页改造成合规内嵌页
- `references/onboarding.md` —— 运营/创作者/管理员上手指南
- `assets/scaffold/` —— 起步项目模板(vite + react);`pnpm dev:host` 提供本地 mock 宿主,不依赖真 App 即可自测嵌入态

### `skill-internal-publish/` —— 运营/管理员发布管理(内部)

供平台运营做**版本发布 / 切换 / 回滚 / 下线**的内部 skill(`deploy.mjs` 对接 dev/prod 分级发布接口)。非创作者使用。

---

## 开发本 SDK

```bash
pnpm install
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup → dist (ESM + CJS + d.ts);改了 src 后必须重新构建并提交 dist
```

> 改 `src/` 后务必 `pnpm build` 重建并提交 `dist/`——消费方走 git 源直接用 `dist/`,不重建则改动不生效。

## 构建与分发(CI/CD)

CI(`.github/workflows/ci.yml`)在 push / PR 上跑 `typecheck` + `build`,上传 `dist` 与 `npm pack` tarball 作为构建产物;打 `v*` tag 时额外创建带 `.tgz` 的 GitHub Release。

**不发布到 npm**(`package.json` 的 `"private": true` 是防误发的保险,与仓库可见性无关)。分发走上面的 git 源安装。
