#!/usr/bin/env node
/**
 * 此文件已废弃。发布脚本（deploy.mjs）现在随创作者脚手架一起提供：
 *   skill/assets/scaffold/scripts/deploy.mjs
 *
 * 内部上线请在创作者项目根目录运行：
 *   pnpm deploy:prod
 *   （等价于：node scripts/deploy.mjs --target prod）
 *
 * 说明：
 * - --target prod 使用 NIETA_API_TOKEN（is_internal 完整登录态），鉴权头 x-token。
 * - --target dev  使用 NIETA_DEV_PUBLISH_TOKEN（scoped dev 令牌），鉴权头 x-dev-publish-token。
 * - 创作者只能 dev（发草稿），内部上线用 prod。
 */
console.error(
  "[deploy] 此文件已废弃。请在创作者项目根目录运行 `pnpm deploy:prod`（脚本在 scripts/deploy.mjs）。"
);
process.exit(1);
