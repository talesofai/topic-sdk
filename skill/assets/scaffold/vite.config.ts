import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 生产构建时 base 必须是 OSS 路径，否则 iframe 中资产引用路径会错。
// base 不再写死占位符：由 scripts/deploy.mjs 在 build 前调 GET /v1/oss/upload-grant
// 实时拿到带版本号的 base_url（形如 https://oss.talesofai.cn/static/topic/<uuid>/<version>/），
// 通过 VITE_OSS_BASE 环境变量注入。
// 注意：直接裸跑 `pnpm build` 而不走 deploy.mjs 时 VITE_OSS_BASE 缺省，base 回退到 "/"——
// 此时产物只适合本地 preview，绝不能直接当成上线产物上传 OSS（资产引用路径会错）。
export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : (process.env.VITE_OSS_BASE ?? "/"),
  build: {
    // hidden sourcemap：保留调试信息但不在产物里引用，不暴露源码。
    sourcemap: "hidden",
  },
  plugins: [react()],
  server: {
    // 本地开发把 /v1 代理到 pre 环境后端
    proxy: {
      "/v1": {
        target: "https://pre.api.talesofai.cn",
        changeOrigin: true,
      },
    },
  },
}));
