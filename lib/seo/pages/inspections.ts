import { createAuditClient } from "@/lib/supabase/audit";
import { absoluteUrlToPath } from "@/lib/seo/pages/path";
import type { LivePageTest } from "@/lib/seo/pages/live-test";
import type { UrlInspectionRecord } from "@/lib/seo/pages/types";
import {
  fetchSearchAnalytics,
  gscConfigured,
  type ParsedIndexInspection,
} from "@/lib/gsc";

function auditDb() {
  return createAuditClient();
}

function rowFromDb(row: Record<string, unknown>): UrlInspectionRecord {
  return {
    page_url: String(row.page_url ?? ""),
    path: String(row.path ?? ""),
    index_status: (row.index_status as UrlInspectionRecord["index_status"]) ?? "UNKNOWN",
    coverage_state: (row.coverage_state as string | null) ?? null,
    verdict: (row.verdict as string | null) ?? null,
    last_crawled_at: (row.last_crawled_at as string | null) ?? null,
    crawl_allowed: (row.crawl_allowed as boolean | null) ?? null,
    indexing_allowed: (row.indexing_allowed as boolean | null) ?? null,
    canonical_google: (row.canonical_google as string | null) ?? null,
    robots_index: (row.robots_index as boolean | null) ?? null,
    page_fetch_state: (row.page_fetch_state as string | null) ?? null,
    live_status: (row.live_status as string | null) ?? null,
    live_http_status: (row.live_http_status as number | null) ?? null,
    performance_score: (row.performance_score as number | null) ?? null,
    seo_score: (row.seo_score as number | null) ?? null,
    accessibility_score: (row.accessibility_score as number | null) ?? null,
    screenshot_data_url: (row.screenshot_data_url as string | null) ?? null,
    inspected_at: (row.inspected_at as string | null) ?? null,
    live_tested_at: (row.live_tested_at as string | null) ?? null,
    index_requested_at: (row.index_requested_at as string | null) ?? null,
    index_request_type: (row.index_request_type as string | null) ?? null,
    index_notify_time: (row.index_notify_time as string | null) ?? null,
    index_request_error: (row.index_request_error as string | null) ?? null,
    gsc_error: (row.gsc_error as string | null) ?? null,
    live_error: (row.live_error as string | null) ?? null,
  };
}

export async function listInspectionsByUrls(pageUrls: string[]): Promise<Map<string, UrlInspectionRecord>> {
  const map = new Map<string, UrlInspectionRecord>();
  if (!pageUrls.length) return map;
  try {
    const db = auditDb();
    const chunkSize = 200;
    for (let i = 0; i < pageUrls.length; i += chunkSize) {
      const chunk = pageUrls.slice(i, i + chunkSize);
      const { data, error } = await db
        .from("seo_url_inspections")
        .select("*")
        .in("page_url", chunk);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const record = rowFromDb(row as Record<string, unknown>);
        map.set(record.page_url, record);
      }
    }

    // 2. Enrich uninspected URLs from seo_audit_gsc_index joined by audits
    const missingUrls = pageUrls.filter((u) => !map.has(u));
    if (missingUrls.length > 0) {
      try {
        const { data: audits } = await db
          .from("seo_audits")
          .select("id,entity_id,page_url")
          .in("page_url", missingUrls.slice(0, 500));

        if (audits && audits.length > 0) {
          const entityIds = Array.from(new Set(audits.map((a) => a.entity_id)));
          const { data: gscRows } = await db
            .from("seo_audit_gsc_index")
            .select("entity_id,canonical_google,index_status,coverage_state,last_crawled_at,crawl_allowed,indexing_allowed")
            .in("entity_id", entityIds)
            .order("captured_at", { ascending: false });

          const gscByEntity = new Map<string, Record<string, unknown>>();
          for (const row of gscRows ?? []) {
            if (!gscByEntity.has(String(row.entity_id))) {
              gscByEntity.set(String(row.entity_id), row as Record<string, unknown>);
            }
          }

          for (const audit of audits) {
            const gsc = gscByEntity.get(audit.entity_id);
            if (gsc && !map.has(audit.page_url)) {
              map.set(
                audit.page_url,
                rowFromDb({
                  page_url: audit.page_url,
                  path: absoluteUrlToPath(audit.page_url),
                  index_status: (gsc.index_status as string) ?? "UNKNOWN",
                  coverage_state: gsc.coverage_state ?? null,
                  verdict: gsc.index_status === "INDEXED" ? "PASS" : null,
                  last_crawled_at: gsc.last_crawled_at ?? null,
                  crawl_allowed: gsc.crawl_allowed ?? null,
                  indexing_allowed: gsc.indexing_allowed ?? null,
                  canonical_google: gsc.canonical_google ?? audit.page_url,
                  robots_index: gsc.indexing_allowed ?? true,
                  page_fetch_state: "SUCCESSFUL",
                }),
              );
            }
          }
        }
      } catch (err) {
        console.warn("[listInspectionsByUrls] audit enrichment fallback error:", err);
      }
    }

    // 3. Enrich remaining URLs from GSC Search Analytics (pages with impressions are definitely indexed)
    const stillMissing = pageUrls.filter((u) => !map.has(u));
    if (stillMissing.length > 0 && gscConfigured()) {
      try {
        const analytics = await fetchSearchAnalytics(undefined, 28, ["page"]);
        const impressionUrls = new Set<string>();
        for (const row of analytics?.rows ?? []) {
          const urlKey = row.keys?.[0];
          if (urlKey && (row.impressions ?? 0) > 0) {
            impressionUrls.add(urlKey);
            // Also add path-normalized variations
            impressionUrls.add(urlKey.replace(/\/+$/, ""));
          }
        }
        for (const url of stillMissing) {
          const trimmed = url.replace(/\/+$/, "");
          if (impressionUrls.has(url) || impressionUrls.has(trimmed)) {
            map.set(
              url,
              rowFromDb({
                page_url: url,
                path: absoluteUrlToPath(url),
                index_status: "INDEXED",
                coverage_state: "Submitted and indexed (Google Search)",
                verdict: "PASS",
                last_crawled_at: null,
                crawl_allowed: true,
                indexing_allowed: true,
                canonical_google: url,
                robots_index: true,
                page_fetch_state: "SUCCESSFUL",
              }),
            );
          }
        }
      } catch {
        /* best effort */
      }
    }
  } catch {
    return map;
  }
  return map;
}

export async function getInspection(pageUrl: string): Promise<UrlInspectionRecord | null> {
  const { data, error } = await auditDb()
    .from("seo_url_inspections")
    .select("*")
    .eq("page_url", pageUrl)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowFromDb(data as Record<string, unknown>) : null;
}

export async function upsertInspection(input: {
  pageUrl: string;
  gsc: ParsedIndexInspection;
  live?: LivePageTest | null;
  gscError?: string | null;
  inspectedBy?: string | null;
}): Promise<UrlInspectionRecord> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    page_url: input.pageUrl,
    path: absoluteUrlToPath(input.pageUrl),
    index_status: input.gsc.index_status,
    coverage_state: input.gsc.coverage_state,
    verdict: input.gsc.verdict,
    last_crawled_at: input.gsc.last_crawled_at,
    crawl_allowed: input.gsc.crawl_allowed,
    indexing_allowed: input.gsc.indexing_allowed,
    canonical_google: input.gsc.canonical_google,
    robots_index: input.gsc.robots_index,
    page_fetch_state: input.gsc.page_fetch_state,
    inspected_at: now,
    gsc_error: input.gscError ?? null,
    inspected_by: input.inspectedBy ?? null,
    updated_at: now,
  };

  if (input.live) {
    payload.live_status = input.live.ok ? "PASS" : "FAIL";
    payload.live_http_status = input.live.http_status;
    payload.performance_score = input.live.performance_score;
    payload.seo_score = input.live.seo_score;
    payload.accessibility_score = input.live.accessibility_score;
    payload.screenshot_data_url = input.live.screenshot_data_url;
    payload.live_tested_at = now;
    payload.live_error = input.live.error;
  }

  const { data, error } = await auditDb()
    .from("seo_url_inspections")
    .upsert(payload, { onConflict: "page_url" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not store inspection");
  return rowFromDb(data as Record<string, unknown>);
}

export async function markIndexRequested(input: {
  pageUrl: string;
  notifyTime?: string | null;
  error?: string | null;
  inspectedBy?: string | null;
}): Promise<UrlInspectionRecord> {
  const now = new Date().toISOString();
  const existing = await getInspection(input.pageUrl);
  const payload: Record<string, unknown> = {
    page_url: input.pageUrl,
    path: absoluteUrlToPath(input.pageUrl),
    index_status: existing?.index_status ?? "UNKNOWN",
    index_requested_at: now,
    index_request_type: "URL_UPDATED",
    index_notify_time: input.notifyTime ?? null,
    index_request_error: input.error ?? null,
    inspected_by: input.inspectedBy ?? null,
    updated_at: now,
  };
  if (!existing) payload.inspected_at = now;

  const { data, error } = await auditDb()
    .from("seo_url_inspections")
    .upsert(payload, { onConflict: "page_url" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not store indexing request");
  return rowFromDb(data as Record<string, unknown>);
}
