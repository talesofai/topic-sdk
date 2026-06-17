#!/usr/bin/env node
/**
 * 内嵌话题页一键上线脚本（替代旧的静态 STS + ali-oss-upload-cli 两段脚本）。
 *
 * 全流程：
 *   1) 读 .env：NIETA_API_TOKEN / NIETA_ACTIVITY_UUID / NIETA_API_BASE
 *   2) GET  {API_BASE}/v1/oss/upload-grant?purpose=topic_embed_page&activity_uuid=<uuid>
 *           （Authorization: Bearer <token>）→ 取 { version, access_key_id, access_key_secret,
 *           security_token, prefix, base_url, bucket, endpoint, allowed_suffixes, max_file_size }
 *           —— STS 仅 scope 到前缀 static/topic/<uuid>/<version>/*，有效期 1h。
 *           bucket / endpoint 由后端权威下发（不在客户端硬编码 region，避免跨 region 上传到错 bucket）。
 *   3) 把 base_url 注入 VITE_OSS_BASE，执行 `pnpm vite build`（vite.config.ts 据此设 base）。
 *   4) 本地预检（后缀白名单 + 单文件大小，与后端 publish 校验一致，提前 fail，避免上传后才 400 留残留）。
 *   5) 两段式上传 dist/ → OSS（并发，缩短 1h STS 窗口内耗时）：
 *        - 非 HTML：Cache-Control: max-age=31536000（长缓存）
 *        - HTML   ：Cache-Control: no-cache,no-store,must-revalidate + 注入 CSP（对象 header，不靠 <meta>）
 *      上传走 ali-oss（CLI 不支持 stsToken，故直接 import ali-oss 并传 stsToken）。
 *   6) POST {API_BASE}/v1/topic-embed/activities/<uuid>/embed-page/publish  body {version}
 *           （Authorization: Bearer <token>）→ 服务端校验 prefix/index.html 存在后激活并绑定，
 *           返回 EmbedPageStateDto { enabled, active_version, versions, updated_at }。
 *   7) 断言 active_version === grant 返回的 version。
 *
 * --dry-run：跑到 grant + build + 本地预检为止，跳过实际上传和 publish（不依赖 ali-oss）。
 *
 * 红线：本脚本只把构建产物挂上 iframe 用的 OSS url，对外分享身份恒为 app.nieta.art/tag?hashtag=X。
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(__filename, "..", "..");
const DIST_DIR = join(PROJECT_ROOT, "dist");
const ENTRY = "index.html";
const DRY_RUN = process.argv.includes("--dry-run");

const ASSET_CACHE = "max-age=31536000";
const HTML_CACHE = "no-cache,no-store,must-revalidate";
const UPLOAD_CONCURRENCY = 8;
// 上传文件数上限：STS 有效期 1h，超大目录可能在上传途中 403。超过即警告。
const FILE_COUNT_WARN_THRESHOLD = 800;

function fail(msg) {
  console.error(`\n[deploy] 错误：${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`[deploy] ${msg}`);
}

/** 按运行期真实 host 派生 CSP，避免写死 .cn 而在 .com/global region 自我拦截白屏。 */
function buildHtmlCsp(apiBase, baseUrl) {
  const apiHost = new URL(apiBase).host; // e.g. api.talesofai.cn / pre.api.talesofai.cn
  const ossHost = new URL(baseUrl).host; // e.g. oss.talesofai.cn
  const appOrigin = apiBase.includes("talesofai.com") ? "app.neta.art" : "app.nieta.art";
  return (
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    `img-src 'self' https://${ossHost}; media-src 'self' https://${ossHost}; ` +
    `font-src 'self'; connect-src 'self' https://${apiHost}; ` +
    `frame-ancestors https://${appOrigin} capacitor://${appOrigin}; upgrade-insecure-requests`
  );
}

/** 极简 .env 解析（不引第三方 dotenv，避免给脚手架再加依赖）。 */
function loadEnv() {
  const envPath = join(PROJECT_ROOT, ".env");
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
  const token = process.env.NIETA_API_TOKEN;
  const activityUuid = process.env.NIETA_ACTIVITY_UUID;
  const apiBase = (process.env.NIETA_API_BASE || "").replace(/\/+$/, "");
  if (!token || token.startsWith("<")) fail("缺少 NIETA_API_TOKEN（见 .env.example）。");
  if (!activityUuid || activityUuid.startsWith("<")) fail("缺少 NIETA_ACTIVITY_UUID（见 .env.example）。");
  if (!apiBase) fail("缺少 NIETA_API_BASE（见 .env.example）。");
  return { token, activityUuid, apiBase };
}

async function requestJson(method, url, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url, init);
  const text = await resp.text();
  if (!resp.ok) {
    fail(`${method} ${url} → HTTP ${resp.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${method} ${url} 返回的不是 JSON：${text}`);
  }
}

/** 递归收集 dist/ 下所有文件，返回 [{ fullPath, relKey, size }]（relKey 用正斜杠）。 */
function collectDistFiles() {
  if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
    fail("dist/ 不存在或不是目录；构建未产出？");
  }
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push({ fullPath: full, relKey: relative(DIST_DIR, full).split(sep).join("/"), size: st.size });
    }
  };
  walk(DIST_DIR);
  return out;
}

/** 并发上限执行（缩短 1h STS 窗口内的串行耗时）。 */
async function mapLimit(items, limit, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      await fn(items[cur]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const { token, activityUuid, apiBase } = loadEnv();

  // 1) upload-grant
  info(`请求 upload-grant（activity_uuid=${activityUuid}）...`);
  const grant = await requestJson(
    "GET",
    `${apiBase}/v1/oss/upload-grant?purpose=topic_embed_page&activity_uuid=${encodeURIComponent(activityUuid)}`,
    token,
  );
  const {
    version,
    access_key_id,
    access_key_secret,
    security_token,
    prefix,
    base_url,
    bucket,
    endpoint: rawEndpoint,
    allowed_suffixes,
    max_file_size,
  } = grant;
  if (
    typeof version !== "number" ||
    !prefix ||
    !base_url ||
    !access_key_id ||
    !access_key_secret ||
    !security_token ||
    !bucket ||
    !rawEndpoint
  ) {
    fail(`upload-grant 响应缺字段（需 version/access_key_id/access_key_secret/security_token/prefix/base_url/bucket/endpoint）：${JSON.stringify(grant)}`);
  }
  // 协议防御：STS 仅 scope 到带尾斜杠的目录前缀；若后端去掉尾斜杠会导致对象 key 错位且 publish 校验同样错位（静默错误）。
  if (!prefix.endsWith("/")) fail(`后端返回的 prefix 未以 '/' 结尾：${prefix}`);
  info(`grant 通过：version=${version}，prefix=${prefix}`);
  info(`base_url=${base_url}，bucket=${bucket}`);

  // 2) build（把 base_url 注入 VITE_OSS_BASE）
  info("执行 vite build（base 注入 VITE_OSS_BASE）...");
  // 用 `pnpm exec`(而非 `pnpm vite`)确保跨平台都能定位到本地 node_modules/.bin/vite（Windows/Git Bash 下 PATH 可能不含 pnpm 全局 bin）。
  execSync("pnpm exec vite build", {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, VITE_OSS_BASE: base_url },
  });

  // 3) 本地预检：dist/index.html 必须存在（否则 publish 服务端会 400 missing index.html）
  if (!existsSync(join(DIST_DIR, ENTRY))) {
    fail(`dist/${ENTRY} 不存在；构建产物缺入口文件，无法 publish。`);
  }
  const files = collectDistFiles();
  info(`dist/ 共 ${files.length} 个文件待上传。`);

  // 后缀白名单 + 单文件大小预检（与后端 publish 校验一致，提前 fail，避免上传后才 400 并留残留对象）。
  const allowed = new Set((allowed_suffixes || []).map((s) => String(s).toLowerCase()));
  for (const f of files) {
    const name = f.relKey.split("/").pop() || "";
    const suffix = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    if (allowed.size && !allowed.has(suffix)) {
      fail(`文件后缀不在白名单：${f.relKey}（允许：${[...allowed].join(", ")}）`);
    }
    if (max_file_size && f.size > max_file_size) {
      fail(`文件超过大小上限（${max_file_size} 字节）：${f.relKey}（${f.size} 字节）`);
    }
  }
  if (files.length > FILE_COUNT_WARN_THRESHOLD) {
    info(
      `警告：文件数 ${files.length} 较多，STS 凭证有效期仅 1 小时，` +
        `上传超时可能中途 403。建议精简产物或分目录上线。`,
    );
  }

  if (DRY_RUN) {
    info("--dry-run：跳过上传与 publish。预检通过（grant + build + index.html + 后缀/大小白名单）。");
    info(`若正式上线，将上传到 prefix=${prefix} 并 publish version=${version}。`);
    return;
  }

  // 4) 两段式上传（ali-oss，带 stsToken）。endpoint/bucket 用 grant 下发值，统一走 https。
  const { default: OSS } = await import("ali-oss").catch(() =>
    fail("缺少 ali-oss 依赖；请先 `pnpm install`（ali-oss 在 devDependencies）。"),
  );
  const endpoint = /^https?:\/\//.test(rawEndpoint) ? rawEndpoint.replace(/^http:/, "https:") : `https://${rawEndpoint}`;
  const client = new OSS({
    accessKeyId: access_key_id,
    accessKeySecret: access_key_secret,
    stsToken: security_token,
    bucket,
    endpoint,
    secure: true,
  });

  const htmlCsp = buildHtmlCsp(apiBase, base_url);
  const isHtml = (relKey) => relKey.toLowerCase().endsWith(".html");
  const assets = files.filter((f) => !isHtml(f.relKey));
  const htmls = files.filter((f) => isHtml(f.relKey));

  info(`上传资产（${assets.length} 个，长缓存，并发 ${UPLOAD_CONCURRENCY}）...`);
  await mapLimit(assets, UPLOAD_CONCURRENCY, (f) =>
    client.put(prefix + f.relKey, f.fullPath, { headers: { "Cache-Control": ASSET_CACHE } }),
  );

  info(`上传 HTML（${htmls.length} 个，禁缓存 + CSP）...`);
  await mapLimit(htmls, UPLOAD_CONCURRENCY, (f) =>
    client.put(prefix + f.relKey, f.fullPath, {
      headers: { "Cache-Control": HTML_CACHE, "Content-Security-Policy": htmlCsp },
    }),
  );
  info("上传完成。");

  // 5) publish（发布即绑定）
  info(`publish version=${version} ...`);
  const state = await requestJson(
    "POST",
    `${apiBase}/v1/topic-embed/activities/${encodeURIComponent(activityUuid)}/embed-page/publish`,
    token,
    { version },
  );

  // 6) 校验门：active_version 必须与 grant 的 version 一致
  if (state.active_version !== version) {
    fail(
      `publish 成功但 active_version(${state.active_version}) 与上传 version(${version}) 不一致；请检查。`,
    );
  }
  info(`上线成功！enabled=${state.enabled}，active_version=${state.active_version}。`);
  info(`对外身份仍为 app.nieta.art/tag?hashtag=...（OSS url 仅供宿主挂载 iframe）。`);
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
