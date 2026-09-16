import { createAuditClient } from "@/lib/supabase/audit";
import { absoluteUrlToPath } from "@/lib/seo/pages/path";
import type { LivePageTest } from "@/lib/seo/pages/live-test";
import type { UrlInspectionRecord } from "@/lib/seo/pages/types";
import type { ParsedIndexInspection } from "@/lib/gsc";

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
