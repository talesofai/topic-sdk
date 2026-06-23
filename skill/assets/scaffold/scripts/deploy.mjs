#!/usr/bin/env node
/**
 * 内嵌话题页发布脚本（dev/prod 分级）。
 *
 * 用法：
 *   node scripts/deploy.mjs [--target dev|prod] [--dry-run]
 *   默认 --target dev（创作者发草稿）。
 *
 * 发布模型：
 *   --target dev  ：发草稿，不激活（不上线）。鉴权用 scoped dev 令牌（NIETA_DEV_PUBLISH_TOKEN）。
 *                   publish body: { version, target: "dev" }
 *                   鉴权头: x-dev-publish-token: <NIETA_DEV_PUBLISH_TOKEN>
 *   --target prod ：发布并激活（上线），仅内部使用。鉴权用完整内部登录态（NIETA_API_TOKEN）。
 *                   publish body: { version, target: "prod" }
 *                   鉴权头: x-token: <NIETA_API_TOKEN>
 *
 * 全流程：
 *   1) 读 .env：凭据 / NIETA_ACTIVITY_UUID / NIETA_API_BASE
 *   2) GET  {API_BASE}/v1/oss/upload-grant?purpose=topic_embed_page&activity_uuid=<uuid>
 *           → 取 { version, access_key_id, access_key_secret, security_token,
 *                  prefix, base_url, bucket, endpoint, allowed_suffixes, max_file_size }
 *   3) 把 base_url 注入 VITE_OSS_BASE，执行 `pnpm exec vite build`。
 *   4) 本地预检（后缀白名单 + 单文件大小）。
 *   5) 两段式上传 dist/ → OSS（ali-oss，带 stsToken）：
 *        - 非 HTML：Cache-Control: max-age=31536000（长缓存）
 *        - HTML   ：Cache-Control: no-cache,no-store,must-revalidate + CSP（对象 header）
 *   6) POST {API_BASE}/v1/topic-embed/activities/<uuid>/embed-page/publish
 *           body: { version, target }
 *           dev: 鉴权头 x-dev-publish-token；prod: 鉴权头 x-token
 *   7) dev：打印草稿版本号，提示在 app 开发者菜单挑版本调试。
 *      prod：断言 active_version === grant 的 version。
 *
 * --dry-run：跑到 grant + build + 本地预检为止，跳过上传和 publish。
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

// 解析 --target dev|prod（默认 dev）
const targetArgIdx = process.argv.indexOf("--target");
const TARGET = targetArgIdx >= 0 ? process.argv[targetArgIdx + 1] : "dev";
if (TARGET !== "dev" && TARGET !== "prod") {
  console.error(`[deploy] 错误：--target 只接受 dev 或 prod，got: ${TARGET}`);
  process.exit(1);
}

const ASSET_CACHE = "max-age=31536000";
const HTML_CACHE = "no-cache,no-store,must-revalidate";
const UPLOAD_CONCURRENCY = 8;
const FILE_COUNT_WARN_THRESHOLD = 800;
// 上传大小硬上限（与后端一致）：单文件 10MB、所有文件总和 100MB。
// 早于上传 fail（grant 下发的 max_file_size 仍单独校验，二者取更严者）。
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function fail(msg) {
  console.error(`\n[deploy] 错误：${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`[deploy] ${msg}`);
}

/** 按运行期真实 host 派生 CSP，避免写死 .cn 而在 .com/global region 自我拦截白屏。
 *  cspAllow：后端 redis 在线托管、随 upload-grant 下发的外站白名单（按 directive 分），追加到对应指令。 */
function buildHtmlCsp(apiBase, baseUrl, cspAllow = {}) {
  const apiHost = new URL(apiBase).host;
  const ossHost = new URL(baseUrl).host;
  // frame-ancestors 的宿主 origin 必须与实际挂 iframe 的宿主环境一致,否则跨域 OSS iframe 会被
  // CSP frame-ancestors 拒绝渲染(白屏)。pre 宿主是 pre.app.nieta.art、prod 是 app.nieta.art
  // (.com 同理 neta.art);按 apiHost 是否 pre.* 派生,避免 pre 环境挂 iframe 被自己的 CSP 拦白屏。
  const brand = apiBase.includes("talesofai.com") ? "app.neta.art" : "app.nieta.art";
  const appOrigin = apiHost.startsWith("pre.") ? `pre.${brand}` : brand;
  // 把白名单某 directive 的域名规范成 https://host 形式并拼到既有指令后
  const withAllow = (directive, base) => {
    const extra = (cspAllow?.[directive] || [])
      .map((d) => String(d).trim())
      .filter(Boolean)
      .map((d) => (/^https?:\/\//.test(d) ? d : `https://${d}`))
      .join(" ");
    return extra ? `${base} ${extra}` : base;
  };
  return (
    `default-src 'none'; ${withAllow("script-src", "script-src 'self' 'unsafe-inline'")}; ` +
    `${withAllow("style-src", "style-src 'self' 'unsafe-inline'")}; ` +
    `${withAllow("img-src", `img-src 'self' https://${ossHost}`)}; ` +
    `${withAllow("media-src", `media-src 'self' https://${ossHost}`)}; ` +
    `${withAllow("font-src", "font-src 'self'")}; ` +
    `${withAllow("connect-src", `connect-src 'self' https://${apiHost}`)}; ` +
    `frame-ancestors https://${appOrigin} capacitor://${appOrigin}; upgrade-insecure-requests`
  );
}

/** 极简 .env 解析（不引第三方 dotenv）。 */
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

  const activityUuid = process.env.NIETA_ACTIVITY_UUID;
  const apiBase = (process.env.NIETA_API_BASE || "").replace(/\/+$/, "");
  if (!activityUuid || activityUuid.startsWith("<"))
    fail("缺少 NIETA_ACTIVITY_UUID（见 .env.example）。");
  if (!apiBase) fail("缺少 NIETA_API_BASE（见 .env.example）。");

  if (TARGET === "dev") {
    const devToken = process.env.NIETA_DEV_PUBLISH_TOKEN;
    if (!devToken || devToken.startsWith("<"))
      fail("dev 模式需要 NIETA_DEV_PUBLISH_TOKEN（在 app 内[生成开发令牌]获取，见 .env.example）。");
    return { devToken, activityUuid, apiBase };
  } else {
    const apiToken = process.env.NIETA_API_TOKEN;
    if (!apiToken || apiToken.startsWith("<"))
      fail("prod 模式需要 NIETA_API_TOKEN（内部运营 is_internal 账号的完整 token，见 .env.example）。");
    return { apiToken, activityUuid, apiBase };
  }
}

/**
 * 发起 HTTP 请求并返回 JSON。
 *
 * target=dev  → 鉴权头 x-dev-publish-token: <devToken>
 * target=prod → 鉴权头 x-token: <apiToken>
 * upload-grant（GET）两种 target 各用自己的头。
 */
async function requestJson(method, url, authHeaders, body) {
  const headers = { ...authHeaders };
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
      else
        out.push({
          fullPath: full,
          relKey: relative(DIST_DIR, full).split(sep).join("/"),
          size: st.size,
        });
    }
  };
  walk(DIST_DIR);
  return out;
}

/** 收集页面源码（src/ 递归 + 根 index.html）；不含 node_modules/dist/scripts/config，避免误扫第三方库与脚本自身。 */
function collectPageSourceFiles() {
  const out = [];
  const rootHtml = join(PROJECT_ROOT, "index.html");
  if (existsSync(rootHtml)) out.push({ relKey: "index.html", fullPath: rootHtml });
  const srcDir = join(PROJECT_ROOT, "src");
  if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else out.push({ relKey: relative(PROJECT_ROOT, full).split(sep).join("/"), fullPath: full });
      }
    };
    walk(srcDir);
  }
  return out.filter((f) => /\.(m?[jt]sx?|cjs|html|css)$/i.test(f.relKey));
}

/**
 * 发布前源码合规扫描：把 compliance.md 中"靠 agent 自觉"的硬红线变成机器 fail-fast，违例当场打回 agent。
 * 只扫页面源码（创作者代码），不扫 node_modules（第三方库）/脚本/配置，避免误报。
 * 确系合法的同源用途，可在该行加注释 sdk-compliance-ok 豁免（需内部 review）。
 */
function scanPageSourceForViolations() {
  const RULES = [
    { re: /localStorage\s*[.[]|sessionStorage\s*[.[]/, msg: "禁止 localStorage/sessionStorage（embed token 只存内存，用 sdk.auth.getToken()；compliance §A）" },
    { re: /document\.cookie\s*=/, msg: "禁止写 cookie 存 token（compliance §A）" },
    { re: /history\s*\.\s*(pushState|replaceState)\s*\(/, msg: "禁止 history.pushState/replaceState（污染 App 返回栈）；改用 hash/内存路由" },
    { re: /navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/, msg: "禁止 ServiceWorker（跨域 sandbox iframe 内无效，只污染控制台）" },
    { re: /method\s*:\s*['"](?:POST|PUT|DELETE|PATCH)['"]/i, msg: "禁止写接口调用（POST/PUT/DELETE/PATCH）；内嵌页只读，写动作走 sdk.nav.internal 跳原生页" },
    { re: /\bnew\s+EventSource\s*\(/, msg: "禁止 EventSource；数据走 sdk.* 只读接口" },
    { re: /window\s*\.\s*parent\s*\.\s*postMessage\s*\(/, msg: "禁止直接 window.parent.postMessage；只经 SDK bridge 通信" },
    { re: /<meta[^>]+http-equiv\s*=\s*["']?\s*content-security-policy/i, msg: "禁止页面自设 CSP <meta>（与上传注入的对象头取交集会白屏）；CSP 由 deploy 注入" },
    { re: /location\s*\.\s*(href|assign|replace)\b[^;\n]*(\/oauth|\/login|\/authorize|\/callback)/i, msg: "禁止 OAuth/登录跳转残留；登录由宿主处理，写意图统一走 sdk.nav.internal" },
  ];
  const OSS_RE = /oss\.talesofai\.cn/;
  const OSS_VISIBLE_RE = /<a[\s>]|href\s*=|textContent|innerHTML|innerText/;
  // 自绘宿主 chrome 的启发式检测（D9）：宿主顶栏/固定浮层已提供 返回/分享/主页/登录/举报 + 安全区，
  // 页面自绘会与宿主重复/冲突。这是 UX 红线、非安全边界，且会误伤合法吸顶筛选条 / 正文含"分享"二字，
  // 故只 warn（不 fail）；确系合法可在该行加 sdk-compliance-ok 豁免。命中行 warn 用以下规则，
  // "position:fixed/sticky + top:0" 常跨行写，故按整文件文本判（见下方 fileText）。
  const CHROME_LINE_RULES = [
    {
      re: /(?:<button|onClick|aria-label|role\s*=\s*["']button["'])[^\n]*(?:返回|分享|主页|首页|举报)|(?:返回|分享|主页|首页|举报)[^\n]*(?:<button|onClick|aria-label)/,
      msg: "疑似自绘宿主已提供的按钮（返回/分享/主页/举报）——这些在宿主顶栏，页面别画（D9）",
    },
    {
      re: /env\(\s*safe-area-inset-top|(?:padding-top|paddingTop)[^\n]*safe-area-inset/i,
      msg: "疑似自加顶部安全区内边距——宿主已占，sdk.ui.viewport().safeTop 恒为 0（D9/§0.6）",
    },
  ];
  const violations = [];
  const warnings = [];
  for (const f of collectPageSourceFiles()) {
    const text = readFileSync(f.fullPath, "utf8");
    const lines = text.split(/\r?\n/);
    // 文件级：position:fixed/sticky + top:0 常分行写，按整文件文本判（命中即疑似自绘固定顶栏）。
    if (
      !text.includes("sdk-compliance-ok") &&
      /position\s*:\s*["']?(?:fixed|sticky)/.test(text) &&
      /\btop\s*:\s*["']?0\b/.test(text)
    ) {
      warnings.push(`${f.relKey} 疑似自绘固定顶栏（position:fixed/sticky + top:0）——宿主顶栏已提供 返回/分享/主页，页面别画顶栏（D9）`);
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("sdk-compliance-ok")) continue;
      for (const { re, msg } of RULES) {
        if (re.test(line)) violations.push(`${f.relKey}:${i + 1} ${msg}`);
      }
      for (const { re, msg } of CHROME_LINE_RULES) {
        if (re.test(line)) warnings.push(`${f.relKey}:${i + 1} ${msg}`);
      }
      if (OSS_RE.test(line) && OSS_VISIBLE_RE.test(line)) {
        violations.push(`${f.relKey}:${i + 1} oss.talesofai.cn 出现在可见引用（<a>/文案）；对外身份须用 app.nieta.art/tag?hashtag=X`);
      }
    }
  }
  if (violations.length) {
    fail(
      `源码合规扫描未通过（发布前硬门，机器检出的红线违例）：\n  - ` +
        violations.join("\n  - ") +
        `\n请修正后重跑。确系合法同源用途的个别行可在行内加注释 sdk-compliance-ok 豁免（需内部 review）。`,
    );
  }
  if (warnings.length) {
    console.log(`\n[deploy] ⚠ 自绘宿主 chrome 警告（D9，非硬门，但极可能违规，请逐条核对 compliance §B）：`);
    for (const w of warnings) console.log(`    - ${w}`);
    console.log(`[deploy] ⚠ 页面只渲染可滚动内容，返回/分享/主页/登录/举报/安全区全在宿主。若确系合法（吸顶二级筛选 tab / 正文含"分享"二字），在该行加 sdk-compliance-ok 豁免可消除此警告。\n`);
  }
  info("源码合规扫描通过。");
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
  info(`发布模式：--target ${TARGET}${DRY_RUN ? " --dry-run" : ""}`);

  // 前置安全/环境检查
  if (Number(process.versions.node.split(".")[0]) < 18) {
    fail(`需要 Node >= 18（当前 ${process.version}）；deploy 依赖全局 fetch。`);
  }
  try {
    const tracked = execSync("git ls-files .env", { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
    if (tracked) {
      fail(".env 已被 git 追踪，凭据有泄露风险。请先 `git rm --cached .env`、确保 .gitignore 含 .env 后重试。");
    }
  } catch {
    // git 不可用 / 非 git 仓库：跳过该绊网（.gitignore 仍是主防线）
  }

  const env = loadEnv();
  const { activityUuid, apiBase } = env;

  // 构造鉴权头（两种 target 用不同头）
  // dev:  x-dev-publish-token（scoped dev 令牌，只能发草稿）
  // prod: x-token（完整内部登录态）
  const authHeaders =
    TARGET === "dev"
      ? { "x-dev-publish-token": env.devToken }
      : { "x-token": env.apiToken };

  // 内部 pre 联调用：pre 网关要求 x-develop-pass 头。真实创作者发 prod 不设此 env，恒 no-op、不影响公开流程。
  // grant 与 publish 都走 authHeaders，故二者一并带上。
  if (process.env.NIETA_DEVELOP_PASS) {
    authHeaders["x-develop-pass"] = process.env.NIETA_DEVELOP_PASS;
  }

  // 1) upload-grant
  info(`请求 upload-grant（activity_uuid=${activityUuid}）...`);
  const grant = await requestJson(
    "GET",
    `${apiBase}/v1/oss/upload-grant?purpose=topic_embed_page&activity_uuid=${encodeURIComponent(activityUuid)}`,
    authHeaders,
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
    csp_allow,
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
    fail(
      `upload-grant 响应缺字段（需 version/access_key_id/access_key_secret/security_token/prefix/base_url/bucket/endpoint）：${JSON.stringify(grant)}`,
    );
  }
  if (!prefix.endsWith("/"))
    fail(`后端返回的 prefix 未以 '/' 结尾：${prefix}`);
  info(`grant 通过：version=${version}，prefix=${prefix}`);
  info(`base_url=${base_url}，bucket=${bucket}`);

  // 1b) 源码合规扫描（红线 fail-fast：把 compliance.md 里靠 agent 自觉的项变成发布前硬门，违例当场打回 agent）
  scanPageSourceForViolations();

  // 2a) 类型门：先跑 tsc（deploy 原本直接 vite build 绕过 tsc，导致可空字段裸用 / 不存在字段 / strict 降级全漏过）
  info("执行 tsc --noEmit（类型门）...");
  execSync("pnpm exec tsc --noEmit", { cwd: PROJECT_ROOT, stdio: "inherit" });

  // 2b) build（把 base_url 注入 VITE_OSS_BASE；apiBase 注入 VITE_API_BASE，与 buildHtmlCsp 同源）
  info("执行 vite build（base 注入 VITE_OSS_BASE / VITE_API_BASE）...");
  execSync("pnpm exec vite build", {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, VITE_OSS_BASE: base_url, VITE_API_BASE: apiBase },
  });

  // 3) 本地预检
  if (!existsSync(join(DIST_DIR, ENTRY))) {
    fail(`dist/${ENTRY} 不存在；构建产物缺入口文件，无法 publish。`);
  }
  const files = collectDistFiles();
  info(`dist/ 共 ${files.length} 个文件待上传。`);

  // 大小预检（早于上传 fail，复用 collectDistFiles 的 size）：
  // 任一文件 > 10MB，或所有文件总和 > 100MB，直接打回。常量与后端一致。
  let totalBytes = 0;
  for (const f of files) {
    totalBytes += f.size;
    if (f.size > MAX_FILE_BYTES) {
      fail(
        `单文件超过大小上限（${MAX_FILE_BYTES} 字节 / 10MB）：${f.relKey}（${f.size} 字节）。` +
          `请精简该资源后重试。`,
      );
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    fail(
      `dist/ 总大小超过上限（${MAX_TOTAL_BYTES} 字节 / 100MB）：当前 ${totalBytes} 字节。` +
        `请精简产物后重试。`,
    );
  }

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
  const extraHtml = files
    .filter((f) => f.relKey.toLowerCase().endsWith(".html"))
    .map((f) => f.relKey)
    .filter((k) => k !== ENTRY);
  if (extraHtml.length) {
    fail(`dist/ 多 HTML 入口：${extraHtml.join(", ")}；内嵌页须合并为单页（唯一入口 ${ENTRY}），其余 .html 公众永不可达。`);
  }

  if (files.length > FILE_COUNT_WARN_THRESHOLD) {
    info(
      `警告：文件数 ${files.length} 较多，STS 凭证有效期仅 1 小时，` +
        `上传超时可能中途 403。建议精简产物或分目录上线。`,
    );
  }

  if (DRY_RUN) {
    info(
      `--dry-run：跳过上传与 publish。预检通过（grant + build + index.html + 后缀/大小白名单）。`,
    );
    info(`若正式发布，将上传到 prefix=${prefix} 并 publish version=${version}（target=${TARGET}）。`);
    return;
  }

  // 4) 两段式上传（ali-oss，带 stsToken）
  const { default: OSS } = await import("ali-oss").catch(() =>
    fail("缺少 ali-oss 依赖；请先 `pnpm install`（ali-oss 在 devDependencies）。"),
  );
  const endpoint = /^https?:\/\//.test(rawEndpoint)
    ? rawEndpoint.replace(/^http:/, "https:")
    : `https://${rawEndpoint}`;
  const client = new OSS({
    accessKeyId: access_key_id,
    accessKeySecret: access_key_secret,
    stsToken: security_token,
    bucket,
    endpoint,
    secure: true,
  });

  const htmlCsp = buildHtmlCsp(apiBase, base_url, csp_allow);
  const isHtml = (relKey) => relKey.toLowerCase().endsWith(".html");
  const assets = files.filter((f) => !isHtml(f.relKey));
  const htmls = files.filter((f) => isHtml(f.relKey));

  info(`上传资产（${assets.length} 个，长缓存，并发 ${UPLOAD_CONCURRENCY}）...`);
  await mapLimit(assets, UPLOAD_CONCURRENCY, (f) =>
    client.put(prefix + f.relKey, f.fullPath, {
      headers: { "Cache-Control": ASSET_CACHE },
    }),
  );

  info(`上传 HTML（${htmls.length} 个，禁缓存 + CSP）...`);
  await mapLimit(htmls, UPLOAD_CONCURRENCY, (f) =>
    client.put(prefix + f.relKey, f.fullPath, {
      headers: {
        "Cache-Control": HTML_CACHE,
        "Content-Security-Policy": htmlCsp,
      },
    }),
  );
  info("上传完成。");

  // 5) publish（带 target 分级）
  info(`publish version=${version}，target=${TARGET} ...`);
  const state = await requestJson(
    "POST",
    `${apiBase}/v1/topic-embed/activities/${encodeURIComponent(activityUuid)}/embed-page/publish`,
    authHeaders,
    { version, target: TARGET },
  );

  // 6) 结果处理
  if (TARGET === "dev") {
    // dev 草稿：active_version 不变（不激活），打印草稿版本供调试
    info(`草稿发布成功！version=${version}（未激活，公众看不到）。`);
    info(`在 app 内打开话题页 → 开发者菜单 → 选"版本 ${version}"即可在真实 embed 上下文调试。`);
    info(`也可直链：/tag?hashtag=<X>&embedPreview=${version}`);
    info(`调试满意后，联系内部团队用 --target prod 上线。`);
  } else {
    // prod 上线：断言 active_version 已切换到本次版本
    if (state.active_version !== version) {
      fail(
        `publish 成功但 active_version(${state.active_version}) 与上传 version(${version}) 不一致；请检查。`,
      );
    }
    info(`上线成功！enabled=${state.enabled}，active_version=${state.active_version}。`);
    info(`对外身份仍为 app.nieta.art/tag?hashtag=...（OSS url 仅供宿主挂载 iframe）。`);
  }
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
