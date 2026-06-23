/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** prod 由 deploy.mjs 注入（与 CSP 同源）；dev 缺省时为 undefined → sdk.ts 回退 window.location.origin。 */
  readonly VITE_API_BASE?: string;
  /** OSS base，由 deploy.mjs 在 build 时注入。 */
  readonly VITE_OSS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
