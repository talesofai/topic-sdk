import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 生产构建时 base 必须是 OSS 路径，否则 iframe 中资产引用路径会错。
// __TOPIC_UUID__ 由平台侧分配，对应 OSS 路径 static/topic/<uuid>/。
export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "https://oss.talesofai.cn/static/topic/__TOPIC_UUID__/",
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
