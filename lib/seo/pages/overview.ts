import { createAuditClient } from "@/lib/supabase/audit";
import { fetchSearchAnalytics, gscConfigured, type GscRow } from "@/lib/gsc";
import { listOverrides } from "@/lib/seo/pages/overrides";
import {
  absoluteUrlToPath,
  pathToAbsoluteUrl,
} from "@/lib/seo/pages/path";
import {
  loadGscSitemapEntries,
  resolveSiteSitemapUrls,
  urlsToPathRows,
} from "@/lib/seo/pages/sitemap";
import type { PageOverviewRow, PageSitemapPayload } from "@/lib/seo/pages/types";
import {
  PAGE_CACHE_KEYS,
  PAGE_CACHE_TTL,
  getOrSetServerCache,
  invalidatePageSeoCaches,
  invalidateServerCache,
  readServerCache,
  writeServerCache,
} from "@/lib/serverCache";

type AuditLite = {
  id: string;
  entity_id: string;
  page_url: string;
  score_total: number | null;
  score_grade: string | null;
  completed_at: string | null;
};

type GscIndexLite = {
  entity_id: string;
  last_crawled_at: string | null;
};

type QueryLite = {
  entity_id: string;
  query: string;
  impressions: number;
};

type PageMetric = {
  impressions: number;
  clicks: number;
  avg_position: number | null;
};

type OverviewResult = {
  pages: PageOverviewRow[];
  synced_at: string;
  cache: "hit" | "miss";
};

function metricFromRows(rows: GscRow[] | undefined): PageMetric {
  if (!rows?.length) {
    return { impressions: 0, clicks: 0, avg_position: null };
  }
  let impressions = 0;
  let clicks = 0;
  let positionWeighted = 0;
  for (const row of rows) {
    impressions += row.impressions ?? 0;
    clicks += row.clicks ?? 0;
    positionWeighted += (row.position ?? 0) * (row.impressions ?? 0);
  }
  return {
    impressions,
    clicks,
    avg_position: impressions
      ? Math.round((positionWeighted / impressions) * 10) / 10
      : null,
  };
}

function urlKeyVariants(pageUrl: string): string[] {
  const keys = new Set<string>();
  keys.add(pageUrl);
  try {
    const url = new URL(pageUrl);
    const host = url.hostname.replace(/^www\./, "");
    const path = absoluteUrlToPath(pageUrl);
    keys.add(path);
    keys.add(`https://${host}${path === "/" ? "" : path}`);
    keys.add(`https://www.${host}${path === "/" ? "" : path}`);
    keys.add(`${url.origin}${url.pathname}`.replace(/\/+$/, "") || url.origin);
  } catch {
    keys.add(absoluteUrlToPath(pageUrl));
  }
  return Array.from(keys);
}

async function loadGscPageMetricsUncached(): Promise<Record<string, PageMetric>> {
  const byPath: Record<string, PageMetric> = {};
  if (!gscConfigured()) return byPath;
  const pageAnalytics = await fetchSearchAnalytics(undefined, 28, ["page"]);
  for (const row of pageAnalytics?.rows ?? []) {
    const pageUrl = row.keys?.[0];
    if (!pageUrl) continue;
    const path = absoluteUrlToPath(pageUrl);
    const next = metricFromRows([row]);
    const existing = byPath[path];
    if (!existing) {
      byPath[path] = next;
    } else {
      byPath[path] = {
        impressions: existing.impressions + next.impressions,
        clicks: existing.clicks + next.clicks,
        avg_position: next.avg_position ?? existing.avg_position,
      };
    }
  }
  return byPath;
}

async function getGscPageMetrics(options: { force?: boolean } = {}) {
  return getOrSetServerCache(
    PAGE_CACHE_KEYS.gscPageMetrics,
    PAGE_CACHE_TTL.gsc,
    loadGscPageMetricsUncached,
    options,
  );
}

async function loadGscKeywordsUncached(
  targets: Array<{ path: string; page_url: string }>,
): Promise<Record<string, string[]>> {
  const keywordsByPage: Record<string, string[]> = {};
  if (!gscConfigured() || !targets.length) return keywordsByPage;

  await Promise.all(
    targets.map(async (row) => {
      try {
        const result = await fetchSearchAnalytics(row.page_url, 28, ["query"]);
        const keywords = (result?.rows ?? [])
          .slice(0, 5)
          .map((item) => item.keys?.[0])
          .filter((value): value is string => Boolean(value));
        if (keywords.length) keywordsByPage[row.path] = keywords;
      } catch {
        /* ignore per-page failures */
      }
    }),
  );
  return keywordsByPage;
}

async function getGscKeywords(
  targets: Array<{ path: string; page_url: string }>,
  options: { force?: boolean } = {},
) {
  // Fingerprint top targets so cache stays stable across identical sync windows.
  const fingerprint = targets
    .map((row) => row.path)
    .sort()
    .join("|")
    .slice(0, 500);
  const key = `${PAGE_CACHE_KEYS.gscKeywords}:${fingerprint}`;
  return getOrSetServerCache(
    key,
    PAGE_CACHE_TTL.gsc,
    () => loadGscKeywordsUncached(targets),
    options,
  );
}

async function buildPageOverviewUncached(options: {
  force?: boolean;
}): Promise<Omit<OverviewResult, "cache">> {
  const [{ pageUrls }, overrides, gscMetrics] = await Promise.all([
    resolveSiteSitemapUrls({ force: options.force }),
    listOverrides().catch((error) => {
      console.error("[page-seo] listOverrides failed", error);
      return [] as Awaited<ReturnType<typeof listOverrides>>;
    }),
    getGscPageMetrics({ force: options.force }).catch((error) => {
      console.error("[page-seo] GSC page analytics failed", error);
      return {} as Record<string, PageMetric>;
    }),
  ]);

  const sitemapRows = urlsToPathRows(pageUrls);
  const overrideByPath = new Map(overrides.map((row) => [row.path, row]));
  const gscByPage = new Map(Object.entries(gscMetrics));

  const pathSet = new Map<
    string,
    { path: string; page_url: string; in_sitemap: boolean }
  >();
  for (const row of sitemapRows) {
    pathSet.set(row.path, { ...row, in_sitemap: true });
  }
  for (const override of overrides) {
    if (!pathSet.has(override.path)) {
      pathSet.set(override.path, {
        path: override.path,
        page_url: pathToAbsoluteUrl(override.path) ?? override.path,
        in_sitemap: false,
      });
    }
  }

  const auditsByPath = new Map<string, AuditLite>();
  const crawlByEntity = new Map<string, string | null>();
  const keywordsByEntity = new Map<string, string[]>();
  const targetIdByPath = new Map<string, string>();

  try {
    const auditDb = createAuditClient();
    const [
      { data: targets },
      { data: audits },
      { data: indexes },
      { data: queries },
    ] = await Promise.all([
      auditDb.from("seo_audit_targets").select("id,page_url,name"),
      auditDb
        .from("seo_audits")
        .select(
          "id,entity_id,page_url,score_total,score_grade,completed_at,entity_type,status",
        )
        .eq("status", "COMPLETED")
        .order("completed_at", { ascending: false })
        .limit(500),
      auditDb
        .from("seo_audit_gsc_index")
        .select("entity_id,last_crawled_at")
        .order("captured_at", { ascending: false })
        .limit(500),
      auditDb
        .from("seo_audit_query_rankings")
        .select("entity_id,query,impressions")
        .order("impressions", { ascending: false })
        .limit(1000),
    ]);

    for (const target of targets ?? []) {
      const path = absoluteUrlToPath(String(target.page_url));
      if (!targetIdByPath.has(path)) {
        targetIdByPath.set(path, String(target.id));
      }
      for (const key of urlKeyVariants(String(target.page_url))) {
        if (!targetIdByPath.has(key)) targetIdByPath.set(key, String(target.id));
      }
    }

    for (const audit of (audits ?? []) as AuditLite[]) {
      const path = absoluteUrlToPath(audit.page_url);
      if (!auditsByPath.has(path)) auditsByPath.set(path, audit);
      for (const key of urlKeyVariants(audit.page_url)) {
        if (!auditsByPath.has(key)) auditsByPath.set(key, audit);
      }
    }

    for (const row of (indexes ?? []) as GscIndexLite[]) {
      if (!crawlByEntity.has(row.entity_id)) {
        crawlByEntity.set(row.entity_id, row.last_crawled_at);
      }
    }

    for (const row of (queries ?? []) as QueryLite[]) {
      const list = keywordsByEntity.get(row.entity_id) ?? [];
      if (list.length < 5 && row.query && !list.includes(row.query)) {
        list.push(row.query);
      }
      keywordsByEntity.set(row.entity_id, list);
    }
  } catch (error) {
    console.error("[page-seo] audit enrichment failed", error);
  }

  const topPaths = Array.from(pathSet.values())
    .map((row) => ({
      ...row,
      impressions: gscByPage.get(row.path)?.impressions ?? 0,
    }))
    .filter((row) => row.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 40);

  const keywordsByPage = await getGscKeywords(topPaths, {
    force: options.force,
  }).catch(() => ({} as Record<string, string[]>));

  const pages: PageOverviewRow[] = Array.from(pathSet.values())
    .map((row) => {
      const override = overrideByPath.get(row.path) ?? null;
      const audit =
        auditsByPath.get(row.path) ?? auditsByPath.get(row.page_url) ?? null;
      const gsc = gscByPage.get(row.path);
      const targetId =
        targetIdByPath.get(row.path) ??
        targetIdByPath.get(row.page_url) ??
        audit?.entity_id ??
        null;
      const keywords =
        keywordsByPage[row.path] ??
        (targetId ? keywordsByEntity.get(targetId) ?? [] : []) ??
        (audit ? keywordsByEntity.get(audit.entity_id) ?? [] : []);

      const lastCrawl =
        (targetId ? crawlByEntity.get(targetId) : null) ??
        (audit ? crawlByEntity.get(audit.entity_id) ?? null : null);

      return {
        path: row.path,
        page_url: row.page_url,
        has_override: Boolean(override),
        override_id: override?.id ?? null,
        is_active: override?.is_active ?? null,
        title: override?.title ?? null,
        score_total: audit?.score_total ?? null,
        score_grade: audit?.score_grade ?? null,
        impressions: gsc?.impressions ?? null,
        clicks: gsc?.clicks ?? null,
        avg_position: gsc?.avg_position ?? null,
        last_crawled_at: lastCrawl ?? null,
        top_keywords: keywords,
        in_sitemap: row.in_sitemap,
        audit_id: audit?.id ?? null,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return { pages, synced_at: new Date().toISOString() };
}

export async function buildPageOverview(options: {
  force?: boolean;
} = {}): Promise<OverviewResult> {
  if (!options.force) {
    const cached = readServerCache<Omit<OverviewResult, "cache">>(
      PAGE_CACHE_KEYS.overview,
    );
    if (cached) return { ...cached, cache: "hit" };
  }

  const built = await buildPageOverviewUncached({ force: Boolean(options.force) });
  writeServerCache(PAGE_CACHE_KEYS.overview, built, PAGE_CACHE_TTL.overview);
  return { ...built, cache: "miss" };
}

async function buildSitemapPayloadUncached(options: {
  force?: boolean;
}): Promise<PageSitemapPayload> {
  const [{ origin, pageUrls }, sitemaps, overrides] = await Promise.all([
    resolveSiteSitemapUrls({ force: options.force }),
    loadGscSitemapEntries({ force: options.force }),
    listOverrides().catch(() => []),
  ]);
  const overridePaths = new Set(overrides.map((row) => row.path));
  const urls = urlsToPathRows(pageUrls).map((row) => ({
    ...row,
    has_override: overridePaths.has(row.path),
  }));
  return {
    sitemaps,
    urls,
    origin,
    synced_at: new Date().toISOString(),
  };
}

export async function buildSitemapPayload(options: {
  force?: boolean;
} = {}): Promise<PageSitemapPayload & { cache: "hit" | "miss" }> {
  if (!options.force) {
    const cached = readServerCache<PageSitemapPayload>(
      PAGE_CACHE_KEYS.sitemapPayload,
    );
    if (cached) return { ...cached, cache: "hit" };
  }

  const payload = await buildSitemapPayloadUncached({
    force: Boolean(options.force),
  });
  writeServerCache(
    PAGE_CACHE_KEYS.sitemapPayload,
    payload,
    PAGE_CACHE_TTL.sitemapPayload,
  );
  return { ...payload, cache: "miss" };
}

export function bumpPageSeoCachesAfterOverrideWrite(): void {
  invalidateServerCache([
    PAGE_CACHE_KEYS.overview,
    PAGE_CACHE_KEYS.sitemapPayload,
  ]);
}

export { invalidatePageSeoCaches };
