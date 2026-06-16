# @talesofai/topic-sdk

给有资质的创作者/运营用来开发 **nieta-app 内嵌话题页**的运行时 SDK。你的页面打包上传到 OSS，由 nieta-app 在 `/tag?hashtag=X` 路由内以 iframe 内嵌。SDK 负责：端探测与三态降级（App / Web 内嵌 / 游客裸链）、只读数据接口（`/v1/embed/*`）、frame-bridge v2 通信、导航与游客唤起 App。

> 这是**对外公开包**，不是 nieta-app 前端内部代码。页面只**读**产品内数据；写动作（分享/登录/举报）由宿主固定浮层承载，SDK 不暴露写方法。

## 安装

本包**不发布到 npm registry**，从私有 GitHub 源码仓库安装（组织内 `talesofai/topic-sdk`，private）。

组织内成员（有仓库访问权）直接装 git 源：

```bash
pnpm add git+ssh://git@github.com/talesofai/topic-sdk.git
# 或 https：pnpm add git+https://github.com/talesofai/topic-sdk.git
```

> 安装时会自动执行 `prepare` 脚本构建 `dist/`（需 Node 工具链；devDependencies 会被自动安装）。

或用 CI 产出的 **release tarball**（无需本地构建）：从仓库 Releases 下载 `.tgz` 后

```bash
pnpm add ./talesofai-topic-sdk-<version>.tgz
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
pnpm install      # 会触发 prepare → 自动 build 一次
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup → dist (ESM + CJS + d.ts)
```

## 构建与分发（CI/CD）

CI（`.github/workflows/ci.yml`）在 push / PR 上跑 `typecheck` + `build`，并上传 `dist` 与 `npm pack` 的 tarball 作为构建产物；打 `v*` tag 时额外创建带 `.tgz` 的 GitHub Release。

**不发布到 npm**（`package.json` 设 `"private": true` 兜底，防误发）。分发走上面的 git 源码安装或 release tarball。
