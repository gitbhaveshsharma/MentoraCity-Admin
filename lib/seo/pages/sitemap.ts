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
} from "@/lib/serverCache";

const MAX_SITEMAP_URLS = 2000;
const FETCH_HEADERS = { "user-agent": "MentoraCity-SEO-Pages/1.0" };

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    locs.push(match[1].trim());
  }
  return locs;
}

function isSitemapIndex(xml: string) {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function fetchXml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: FETCH_HEADERS,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
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

  return {
    origin,
    pageUrls: Array.from(pageUrls).slice(0, MAX_SITEMAP_URLS),
    sourceSitemaps,
  };
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
