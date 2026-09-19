import {
  absoluteUrlToPath,
  normalizePath,
  pathToAbsoluteUrl,
  siteOrigin,
} from "@/lib/seo/pages/path";
import type { GscSitemapEntry } from "@/lib/seo/pages/types";
import {
  gscConfigured,
  listSitemaps as listGscSitemaps,
  reportGscError,
} from "@/lib/gsc";
import {
  PAGE_CACHE_KEYS,
  PAGE_CACHE_TTL,
  getOrSetServerCache,
  invalidateServerCache,
  writeServerCache,
} from "@/lib/serverCache";

import { createAuditClient } from "@/lib/supabase/audit";
import { fetchSearchAnalytics } from "@/lib/gsc";

const MAX_SITEMAP_URLS = 2000;

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  accept: "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const GOOGLEBOT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  accept: "application/xml,text/xml,*/*;q=0.9",
};

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    let loc = match[1].trim();
    const cdataMatch = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(loc);
    if (cdataMatch) loc = cdataMatch[1].trim();
    if (loc && /^https?:\/\//i.test(loc)) {
      locs.push(loc);
    }
  }
  return locs;
}

function isSitemapIndex(xml: string) {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function fetchXml(url: string): Promise<string | null> {
  const tryFetch = async (headers: Record<string, string>) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        cache: "no-store",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        console.warn(
          `[sitemap] fetchXml returned HTTP ${response.status} for ${url}`,
        );
        return null;
      }
      return await response.text();
    } catch (error) {
      console.warn(
        `[sitemap] fetchXml network error for ${url}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  };

  // Attempt 1: Standard browser headers (avoids basic bot-block)
  let text = await tryFetch(BROWSER_HEADERS);
  if (text && text.includes("<loc")) return text;

  // Attempt 2: Googlebot headers
  text = await tryFetch(GOOGLEBOT_HEADERS);
  if (text && text.includes("<loc")) return text;

  // Attempt 3: Lightweight headers
  text = await tryFetch({ "user-agent": "MentoraCity-SEO/1.0" });
  return text && text.includes("<loc") ? text : null;
}

/** Recursively collect page URLs from a sitemap or sitemap index. */
export async function collectSitemapUrls(
  sitemapUrl: string,
  depth = 0,
  seen = new Set<string>(),
): Promise<string[]> {
  if (depth > 3 || seen.has(sitemapUrl) || seen.size >= MAX_SITEMAP_URLS) return [];
  seen.add(sitemapUrl);
  const xml = await fetchXml(sitemapUrl);
  if (!xml) return [];

  const locs = extractLocs(xml);
  if (isSitemapIndex(xml)) {
    const nested: string[] = [];
    for (const child of locs) {
      if (nested.length >= MAX_SITEMAP_URLS) break;
      const childUrls = await collectSitemapUrls(child, depth + 1, seen);
      nested.push(...childUrls);
    }
    return nested.slice(0, MAX_SITEMAP_URLS);
  }
  return locs.slice(0, MAX_SITEMAP_URLS);
}

export function defaultSitemapCandidates(origin: string | null): string[] {
  if (!origin) return [];
  const base = origin.replace(/\/+$/, "");
  return [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/sitemap-index.xml`];
}

/** Discovers URLs from database and GSC Search Analytics if XML sitemap fetching is blocked. */
async function loadFallbackPageUrls(origin: string | null): Promise<string[]> {
  const urls = new Set<string>();
  if (!origin) return [];
  const base = origin.replace(/\/+$/, "");
  urls.add(`${base}/`);
  urls.add(`${base}/coaching`);
  urls.add(`${base}/blog`);
  urls.add(`${base}/learn`);
  urls.add(`${base}/about`);

  try {
    const auditDb = createAuditClient();
    const [targets, overrides, blogs] = await Promise.all([
      auditDb.from("seo_audit_targets").select("page_url").limit(1000),
      auditDb.from("coaching_seo_overrides").select("path").limit(1000),
      auditDb.from("blogs").select("slug").eq("status", "published").limit(500),
    ]);
    for (const t of targets.data ?? []) {
      if (t.page_url) urls.add(String(t.page_url));
    }
    for (const o of overrides.data ?? []) {
      if (o.path) {
        const u = pathToAbsoluteUrl(String(o.path), origin);
        if (u) urls.add(u);
      }
    }
    for (const b of blogs.data ?? []) {
      if (b.slug) urls.add(`${base}/blog/${b.slug}`);
    }
  } catch (err) {
    console.warn("[sitemap] fallback url query error:", err);
  }

  if (gscConfigured()) {
    try {
      const analytics = await fetchSearchAnalytics(undefined, 90, ["page"]);
      for (const row of analytics?.rows ?? []) {
        const pageUrl = row.keys?.[0];
        if (pageUrl) urls.add(pageUrl);
      }
    } catch {
      /* best effort */
    }
  }

  return Array.from(urls);
}

async function loadSiteSitemapUrlsUncached(): Promise<{
  origin: string | null;
  pageUrls: string[];
  sourceSitemaps: string[];
}> {
  const origin = siteOrigin();
  const sourceSitemaps: string[] = [];
  const pageUrls = new Set<string>();

  if (gscConfigured()) {
    try {
      const listed = await listGscSitemaps();
      for (const entry of listed) {
        if (entry.path) sourceSitemaps.push(entry.path);
      }
    } catch (error) {
      reportGscError("sitemaps.list", error);
    }
  }

  for (const candidate of defaultSitemapCandidates(origin)) {
    if (!sourceSitemaps.includes(candidate)) sourceSitemaps.push(candidate);
  }

  for (const sitemapUrl of sourceSitemaps) {
    const urls = await collectSitemapUrls(sitemapUrl);
    for (const url of urls) pageUrls.add(url);
    if (pageUrls.size >= MAX_SITEMAP_URLS) break;
  }

  // Fallback: If sitemap XML was unreachable or returned fewer than 50 URLs (e.g. Cloudflare challenge on Vercel IPs)
  if (pageUrls.size < 50) {
    console.warn(
      `[sitemap] Only ${pageUrls.size} URLs collected from XML sitemaps (${sourceSitemaps.join(", ")}). Loading fallback discovered pages.`,
    );
    const fallbackUrls = await loadFallbackPageUrls(origin);
    for (const url of fallbackUrls) pageUrls.add(url);
  }

  return {
    origin,
    pageUrls: Array.from(pageUrls).slice(0, MAX_SITEMAP_URLS),
    sourceSitemaps,
  };
}

/** Allows client-side discovered sitemap URLs (from direct browser CORS fetch) to update server cache. */
export async function syncClientSitemapUrls(urls: string[]) {
  const origin = siteOrigin();
  const uniqueUrls = Array.from(new Set(urls)).slice(0, MAX_SITEMAP_URLS);
  writeServerCache(
    PAGE_CACHE_KEYS.sitemapUrls,
    {
      origin,
      pageUrls: uniqueUrls,
      sourceSitemaps: defaultSitemapCandidates(origin),
    },
    PAGE_CACHE_TTL.sitemapUrls,
  );
  invalidateServerCache(PAGE_CACHE_KEYS.sitemapPayload);
}

export async function resolveSiteSitemapUrls(options: { force?: boolean } = {}) {
  return getOrSetServerCache(
    PAGE_CACHE_KEYS.sitemapUrls,
    PAGE_CACHE_TTL.sitemapUrls,
    loadSiteSitemapUrlsUncached,
    options,
  );
}

export function urlsToPathRows(pageUrls: string[]) {
  const rows = new Map<string, { path: string; page_url: string }>();
  for (const pageUrl of pageUrls) {
    const path = absoluteUrlToPath(pageUrl);
    const absolute = pathToAbsoluteUrl(path) ?? pageUrl;
    if (!rows.has(path)) rows.set(path, { path, page_url: absolute });
  }
  return Array.from(rows.values()).sort((a, b) => a.path.localeCompare(b.path));
}

async function loadGscSitemapEntriesUncached(): Promise<GscSitemapEntry[]> {
  if (!gscConfigured()) return [];
  try {
    return await listGscSitemaps();
  } catch (error) {
    reportGscError("sitemaps.list", error);
    return [];
  }
}

export async function loadGscSitemapEntries(options: { force?: boolean } = {}) {
  return getOrSetServerCache(
    PAGE_CACHE_KEYS.gscSitemapList,
    PAGE_CACHE_TTL.gsc,
    loadGscSitemapEntriesUncached,
    options,
  );
}

export { normalizePath, pathToAbsoluteUrl, absoluteUrlToPath, siteOrigin };
