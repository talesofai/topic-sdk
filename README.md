# @talesofai/topic-sdk

给有资质的创作者/运营用来开发 **nieta-app 内嵌话题页**的运行时 SDK。你的页面打包上传到 OSS，由 nieta-app 在 `/tag?hashtag=X` 路由内以 iframe 内嵌。SDK 负责：端探测与三态降级（App / Web 内嵌 / 游客裸链）、只读数据接口（`/v1/embed/*`）、frame-bridge v2 通信、导航与游客唤起 App。

> 这是**对外公开包**，不是 nieta-app 前端内部代码。页面只**读**产品内数据；写动作（分享/登录/举报）由宿主固定浮层承载，SDK 不暴露写方法。

## 安装

SDK 发布在组织私有 registry。在你的项目根加 `.npmrc`：

```
@talesofai:registry=https://registry.npm.talesofai.cn/
```

然后：

```bash
pnpm add @talesofai/topic-sdk
```

## 快速开始

```ts
import { createTopicSDK } from "@talesofai/topic-sdk";

const sdk = await createTopicSDK({
  tokenTimeout: 3000,
  onAuthLost: () => {
    /* 只做匿名降级，不抛错 */
  },
});

const detail = await sdk.topic.getDetail("春日活动");
const page = await sdk.topic.listStories("春日活动", { pageIndex: 0, pageSize: 20, sort: "hot" });
```

完整契约、AllowedRoute 白名单、三态降级、可空字段、错误模型见下面的 skill。

## 配套 skill（强烈推荐）

`skill/` 目录是一个 **Claude Code skill**：把它装进你的 Claude Code（`.claude/skills/`），让 agent 引导你从零脚手架、开发、自测、构建、上传 OSS，并逐项过合规红线。

- `skill/SKILL.md` —— agent 执行工作流（含校验门）
- `skill/COMPLIANCE.md` —— 上线红线 checklist
- `skill/reference/api-cheatsheet.md` —— 离线 API/契约速查
- `skill/scaffold/` —— 起步项目模板（vite + react）

## 开发本 SDK

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # tsup → dist (ESM + CJS + d.ts)
```

## 发布

`publishConfig.registry` 指向私有 registry。`prepublishOnly` 会先 typecheck + build。

```bash
npm publish
```
