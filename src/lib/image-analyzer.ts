// lib/image-analyzer.ts
// Place at: lib/image-analyzer.ts
// npm install cheerio image-size

import * as cheerio from "cheerio";
import { imageSize } from "image-size";

export interface ImageInfo {
  src: string;
  resolvedUrl: string | null;
  alt: string | null;
  isDecorative: boolean;       // alt="" (explicitly empty, not missing)
  altMissing: boolean;         // no alt attribute at all (real accessibility issue)
  loading: string | null;
  hasLazyLoading: boolean;
  srcset: string | null;
  sizes: string | null;
  hasSrcset: boolean;
  inPictureWithSources: boolean;
  pictureSourceTypes: string[]; // e.g. ["image/webp", "image/avif"]
  isResponsive: boolean;        // srcset+sizes, or <picture> with >=1 <source>
  declaredWidth: number | null;
  declaredHeight: number | null;
  extensionFormat: string | null; // guessed from URL extension
  isModernExtension: boolean;     // .webp / .avif by extension
}

export interface ImageCheckResult {
  resolvedUrl: string;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  fileSizeBytes: number | null;
  actualWidth: number | null;
  actualHeight: number | null;
  detectedFormat: string | null; // actual format from file bytes (may differ from extension)
  oversizedByFileSize: boolean;
  oversizedByResolution: boolean;
  oversizedReasons: string[];
}

export interface ImageAnalysisReport {
  scannedUrl: string;
  totalImageTags: number;
  totalUniqueImages: number;

  oversizedImages: (ImageCheckResult & { src: string })[];
  missingLazyLoading: ImageInfo[];
  missingSrcset: ImageInfo[];
  nonModernFormatImages: ImageInfo[];
  duplicateImages: { resolvedUrl: string; count: number; usedAsSrc: string[] }[];
  brokenImages: ImageCheckResult[];
  decorativeImages: ImageInfo[];
  missingAltImages: ImageInfo[];
  responsiveImages: ImageInfo[];
  nonResponsiveImages: ImageInfo[];

  allImages: ImageInfo[];
  allChecked: ImageCheckResult[];
}

export interface ImageAnalyzeOptions {
  maxFileSizeBytes?: number;      // flag images larger than this (default 200KB)
  oversizeRatio?: number;         // actual px / declared px ratio that counts as "oversized" (default 1.5)
  concurrency?: number;           // default 6
  fetchTimeoutMs?: number;        // default 8000
  probeBytes?: number;            // bytes to fetch via Range for dimension probing (default 65536)
  userAgent?: string;
}

const DEFAULTS: Required<ImageAnalyzeOptions> = {
  maxFileSizeBytes: 200 * 1024,
  oversizeRatio: 1.5,
  concurrency: 6,
  fetchTimeoutMs: 8000,
  probeBytes: 65536,
  userAgent: "Mozilla/5.0 (compatible; ImageAnalyzerBot/1.0)",
};

const MODERN_EXTENSIONS = new Set(["webp", "avif"]);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function guessExtension(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function resolveUrl(src: string, baseUrl: string): string | null {
  if (!src || src.trim() === "") return null;
  if (src.startsWith("data:")) return null; // inline images aren't network-checkable
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Parses first URL out of a srcset attribute value (for representative checks) — but we also expose all candidates. */
function parseSrcsetUrls(srcset: string, baseUrl: string): string[] {
  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map((u) => resolveUrl(u, baseUrl))
    .filter((u): u is string => !!u);
}

export function extractImages(html: string, baseUrl: string): ImageInfo[] {
  const $ = cheerio.load(html);
  const images: ImageInfo[] = [];

  $("img").each((_, el) => {
    const $img = $(el);
    const src = $img.attr("src") ?? $img.attr("data-src") ?? "";
    const alt = $img.attr("alt");
    const loading = $img.attr("loading") ?? null;
    const srcset = $img.attr("srcset") ?? $img.attr("data-srcset") ?? null;
    const sizes = $img.attr("sizes") ?? null;
    const widthAttr = $img.attr("width");
    const heightAttr = $img.attr("height");

    const $picture = $img.closest("picture");
    const inPicture = $picture.length > 0;
    const sourceTypes: string[] = [];
    if (inPicture) {
      $picture.find("source").each((_, s) => {
        const type = $(s).attr("type");
        if (type) sourceTypes.push(type.toLowerCase());
      });
    }

    const resolvedUrl = resolveUrl(src, baseUrl);
    const ext = guessExtension(src);
    const hasSrcset = !!srcset && srcset.trim() !== "";
    const isResponsive = (hasSrcset && !!sizes) || (inPicture && sourceTypes.length > 0);

    images.push({
      src,
      resolvedUrl,
      alt: alt ?? null,
      isDecorative: alt === "",
      altMissing: alt === undefined,
      loading,
      hasLazyLoading: loading === "lazy",
      srcset,
      sizes,
      hasSrcset,
      inPictureWithSources: inPicture && sourceTypes.length > 0,
      pictureSourceTypes: sourceTypes,
      isResponsive,
      declaredWidth: widthAttr ? parseInt(widthAttr, 10) || null : null,
      declaredHeight: heightAttr ? parseInt(heightAttr, 10) || null : null,
      extensionFormat: ext,
      isModernExtension: ext ? MODERN_EXTENSIONS.has(ext) : false,
    });
  });

  return images;
}

async function checkImage(
  resolvedUrl: string,
  options: Required<ImageAnalyzeOptions>
): Promise<ImageCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.fetchTimeoutMs);

  try {
    let res: Response;
    try {
      res = await fetch(resolvedUrl, {
        headers: {
          "User-Agent": options.userAgent,
          Range: `bytes=0-${options.probeBytes - 1}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok && res.status !== 206) {
      return {
        resolvedUrl, ok: false, statusCode: res.status, error: `HTTP ${res.status}`,
        fileSizeBytes: null, actualWidth: null, actualHeight: null, detectedFormat: null,
        oversizedByFileSize: false, oversizedByResolution: false, oversizedReasons: [],
      };
    }

    // Full size: prefer Content-Range total, else Content-Length (only accurate if server ignored Range)
    const contentRange = res.headers.get("content-range"); // e.g. "bytes 0-65535/482930"
    const totalFromRange = contentRange ? parseInt(contentRange.split("/")[1], 10) : null;
    const contentLength = res.headers.get("content-length");
    const fileSizeBytes = totalFromRange ?? (contentLength ? parseInt(contentLength, 10) : null);

    const buffer = Buffer.from(await res.arrayBuffer());

    let actualWidth: number | null = null;
    let actualHeight: number | null = null;
    let detectedFormat: string | null = null;
    try {
      const dims = imageSize(buffer);
      actualWidth = dims.width ?? null;
      actualHeight = dims.height ?? null;
      detectedFormat = dims.type ?? null;
    } catch {
      // Header wasn't fully in the probed bytes, or unsupported format — leave nulls.
    }

    return {
      resolvedUrl, ok: true, statusCode: res.status, error: null,
      fileSizeBytes, actualWidth, actualHeight, detectedFormat,
      oversizedByFileSize: fileSizeBytes !== null && fileSizeBytes > options.maxFileSizeBytes,
      oversizedByResolution: false, // filled in later once we know declared display size
      oversizedReasons: [],
    };
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "Timed out" : (err?.message ?? "Network error");
    return {
      resolvedUrl, ok: false, statusCode: null, error: msg,
      fileSizeBytes: null, actualWidth: null, actualHeight: null, detectedFormat: null,
      oversizedByFileSize: false, oversizedByResolution: false, oversizedReasons: [],
    };
  }
}

export async function analyzeImages(scannedUrl: string, opts: ImageAnalyzeOptions = {}): Promise<ImageAnalysisReport> {
  const options = { ...DEFAULTS, ...opts };

  const pageRes = await fetch(scannedUrl, { headers: { "User-Agent": options.userAgent } });
  if (!pageRes.ok) throw new Error(`Failed to fetch page to analyze: HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  const images = extractImages(html, scannedUrl);
  const withUrls = images.filter((img) => img.resolvedUrl);
  const uniqueUrls = Array.from(new Set(withUrls.map((img) => img.resolvedUrl!)));

  const checked = await mapLimit(uniqueUrls, options.concurrency, (url) => checkImage(url, options));
  const checkByUrl = new Map(checked.map((c) => [c.resolvedUrl, c]));

  // Fold in resolution-based oversize check now that we have declared dims per <img>
  for (const img of withUrls) {
    const check = checkByUrl.get(img.resolvedUrl!);
    if (!check || !check.actualWidth || !img.declaredWidth) continue;
    const ratio = check.actualWidth / img.declaredWidth;
    if (ratio >= options.oversizeRatio) {
      check.oversizedByResolution = true;
      check.oversizedReasons.push(
        `Served at ${check.actualWidth}px wide but displayed at ${img.declaredWidth}px (${ratio.toFixed(1)}x larger than needed).`
      );
    }
    if (check.oversizedByFileSize) {
      check.oversizedReasons.push(
        `File size ${(check.fileSizeBytes! / 1024).toFixed(0)}KB exceeds ${(options.maxFileSizeBytes / 1024).toFixed(0)}KB threshold.`
      );
    }
  }

  // Duplicates: same resolved URL used in multiple <img> tags
  const groups = new Map<string, ImageInfo[]>();
  for (const img of withUrls) {
    const key = img.resolvedUrl!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(img);
  }
  const duplicateImages = Array.from(groups.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([resolvedUrl, arr]) => ({
      resolvedUrl,
      count: arr.length,
      usedAsSrc: arr.map((i) => i.src),
    }));

  const oversizedImages = withUrls
    .map((img) => {
      const check = checkByUrl.get(img.resolvedUrl!);
      return check && (check.oversizedByFileSize || check.oversizedByResolution) ? { ...check, src: img.src } : null;
    })
    .filter((x): x is ImageCheckResult & { src: string } => !!x);

  return {
    scannedUrl,
    totalImageTags: images.length,
    totalUniqueImages: uniqueUrls.length,

    oversizedImages,
    missingLazyLoading: images.filter((i) => !i.hasLazyLoading),
    missingSrcset: images.filter((i) => !i.hasSrcset && !i.inPictureWithSources),
    nonModernFormatImages: images.filter((i) => !i.isModernExtension && i.pictureSourceTypes.length === 0),
    duplicateImages,
    brokenImages: checked.filter((c) => !c.ok),
    decorativeImages: images.filter((i) => i.isDecorative),
    missingAltImages: images.filter((i) => i.altMissing),
    responsiveImages: images.filter((i) => i.isResponsive),
    nonResponsiveImages: images.filter((i) => !i.isResponsive),

    allImages: images,
    allChecked: checked,
  };
}
