import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getSdk } from "./sdk";

// 立刻起播 SDK 初始化(hello 握手等),独立于 App 的渲染树——即便 App 自己在挂载后的任意逻辑
// (视频/音频播放、第三方库…)抛出未捕获异常导致内容区渲染异常,hello 依然已经独立在跑，
// 不会被拖累到 8s 后被宿主误判"未握手"。getSdk() 是单例 Promise，App.tsx 里再次调用会
// 直接复用这个已经在途/已完成的实例，不会重复握手。
void getSdk();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
