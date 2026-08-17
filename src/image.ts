/**
 * OSS 图片处理参数化：拼接 `x-oss-process`（resize/format/quality）。
 * 与 talesofai 其余前端（weapp/event/bff 的 getImageLink）同一套 OSS 图片处理约定，
 * 移植到这里是为了让内嵌页也别再把原图尺寸直出——不同卡片位置渲染宽度不同，
 * 高分屏（devicePixelRatio > 1）不按比例多请求像素会糊，全量按比例请求又会浪费流量。
 */

const DEFAULT_QUALITY = 80;
/** 设备像素比 clamp 上限：4x/5x 屏再按比例放大意义不大，只会白白增加流量。 */
const MAX_DPR = 3;

export interface OssImageOptions {
  /** 目标 CSS 展示宽度（px）。省略则不做 resize，只处理 format/quality。 */
  width?: number;
  /** 设备像素比倍率；省略则取 `window.devicePixelRatio`（非浏览器环境兜底 1），并 clamp 到 [1, MAX_DPR]。 */
  dpr?: number;
  /** 输出质量 1-100，默认 80（与其余前端一致）。 */
  quality?: number;
  /** 是否转 webp，默认 true。 */
  webp?: boolean;
}

function resolveDpr(explicit?: number): number {
  if (typeof explicit === "number" && explicit > 0) return Math.min(explicit, MAX_DPR);
  const detected = typeof window !== "undefined" && typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1;
  return Math.min(Math.max(detected, 1), MAX_DPR);
}

function buildOssProcess(pixelWidth: number | undefined, quality: number, webp: boolean): string {
  const styles: string[] = ["image", "auto-orient,1"];
  if (pixelWidth && pixelWidth > 0) styles.push(`resize,m_lfit,w_${Math.round(pixelWidth)}`);
  if (webp) styles.push("format,webp");
  styles.push(`quality,q_${quality}`);
  return styles.join("/");
}

/**
 * 按目标展示宽度 + 设备像素比拼接 OSS 图片处理参数。
 * 卡片封面/头像等按实际渲染宽度传 `width`（如缩略图 200、大图 750），SDK 按屏幕 dpr 换算成实取像素宽。
 * 非 http(s)（如 `data:` 内联图）解析失败时原样返回，不强行拼参数——`data:` URL 拼 `?x-oss-process=`
 * 会把 base64 payload 直接拼坏。已经带 `x-oss-process` 的 URL（后端预处理过 / 重复调用）也原样返回，
 * 不再叠加第二个同名 query key（OSS 对重复 key 的解析行为未定义）。
 */
export function ossImage(source: string | null | undefined, options?: OssImageOptions): string | null {
  if (!source) return null;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return source;
  if (url.searchParams.has("x-oss-process")) return source;
  const { width, quality = DEFAULT_QUALITY, webp = true, dpr } = options ?? {};
  const pixelWidth = width && width > 0 ? width * resolveDpr(dpr) : undefined;
  url.searchParams.set("x-oss-process", buildOssProcess(pixelWidth, quality, webp));
  return url.toString();
}

/**
 * 生成 1x/2x/3x 三档 `srcset`（配合 `<img sizes>` 用），让浏览器按实际设备像素比自己选图。
 * `width` 是 1x（CSS px）基准宽度；2x/3x 档在此基础上按比例放大取图。
 */
export function ossImageSrcSet(
  source: string | null | undefined,
  width: number,
  options?: Omit<OssImageOptions, "dpr" | "width">,
): string | null {
  if (!source) return null;
  const scales = [1, 2, 3];
  return scales.map((scale) => `${ossImage(source, { ...options, width, dpr: scale })} ${scale}x`).join(", ");
}
