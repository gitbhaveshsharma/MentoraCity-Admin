import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";
import { auditRequestSchema } from "@/lib/validations/audit.schema";
import { normalizeSeo } from "@/lib/types";
import { applyGscSignals, auditSeo } from "@/lib/audit/engine";
import { fetchPageSeo } from "@/lib/audit/page";
import { fetchSearchAnalytics, gscConfigured, gscConfigurationError, inspectUrl, reportGscError, validateAuditPageUrl } from "@/lib/gsc";

type GscError = { operation: string; message: string };

type GscStat = { date_range: "7d" | "28d" | "90d"; clicks: number; impressions: number; ctr: number | null; avg_position: number | null };

const issueTitle = (issueCode: string) => issueCode.toLowerCase().replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());

export async function POST(request: Request) {
  const production = await createClient();
  const { data: { user } } = await production.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(production, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = auditRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  let entityId = input.entity_id;
  let entityName = input.page_name?.trim() ?? "";
  let pageUrl = input.page_url ?? "";
  let entityMetadata: Record<string, unknown> = {};

  if (input.entity_type === "page") {
    const propertyCheck = validateAuditPageUrl(pageUrl);
    if (!propertyCheck.valid) return NextResponse.json({ error: propertyCheck.message }, { status: 400 });
    const parsedUrl = new URL(pageUrl);
    pageUrl = parsedUrl.toString();
    entityName = entityName || parsedUrl.hostname + (parsedUrl.pathname === "/" ? "" : parsedUrl.pathname);
  } else {
    const table = input.entity_type === "center" ? "coaching_centers" : "coaching_branches";
    const columns = input.entity_type === "center" ? "id,name,slug,metadata" : "id,name,branch_slug,metadata";
    const { data: entity, error: entityError } = await production.from(table).select(columns).eq("id", input.entity_id!).single();
    if (!entity) return NextResponse.json({ error: entityError?.message ?? "Production entity not found" }, { status: 404 });
    entityName = entity.name;
    entityMetadata = entity.metadata ?? {};
    const entitySlug = (entity as { slug?: string; branch_slug?: string }).slug ?? (entity as { branch_slug?: string }).branch_slug ?? entity.id;
    pageUrl = normalizeSeo(entityMetadata, entity.name, (entity.metadata?.seo?.canonical_url ?? ((process.env.PUBLIC_SITE_URL ?? "") + "/" + input.entity_type + "/" + entitySlug))).canonical_url;
    const propertyCheck = validateAuditPageUrl(pageUrl);
    if (!propertyCheck.valid) return NextResponse.json({ error: propertyCheck.message }, { status: 400 });
  }

  let auditDb: ReturnType<typeof createAuditClient>;
  try { auditDb = createAuditClient(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }); }

  if (input.entity_type === "page") {
    const { data: target, error: targetError } = await auditDb.from("seo_audit_targets").upsert({ page_url: pageUrl, name: entityName, created_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "page_url" }).select("id").single();
    if (targetError || !target) return NextResponse.json({ error: targetError?.message ?? "Could not store audit page" }, { status: 500 });
    entityId = target.id;
  }
  if (!entityId) return NextResponse.json({ error: "Audit target id is missing" }, { status: 400 });
  const { data: previous } = await auditDb.from("seo_audits").select("id,score_total").eq("entity_type", input.entity_type).eq("entity_id", entityId).eq("status", "COMPLETED").order("triggered_at", { ascending: false }).limit(1).maybeSingle();
  const { data: created, error: createError } = await auditDb.from("seo_audits").insert({ entity_type: input.entity_type, entity_id: entityId, page_url: pageUrl, triggered_by_user_id: user.id, status: "RUNNING", previous_audit_id: previous?.id ?? null }).select("id").single();
  if (createError || !created) return NextResponse.json({ error: createError?.message ?? "Could not create audit" }, { status: 500 });
  const auditId = created.id;
  await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: entityId, audit_id: auditId, action: "AUDIT_TRIGGERED", performed_by: user.id });

  try {
    const seo = input.entity_type === "page" ? await fetchPageSeo(pageUrl, entityName) : normalizeSeo(entityMetadata, entityName, pageUrl);
    const structuralResult = auditSeo(seo);
    const gscErrors: GscError[] = [];
    const gscStats: GscStat[] = [];
    const queryRows: Array<{ query: string; clicks: number; impressions: number; ctr: number | null; position: number | null }> = [];
    const deviceRows: Array<{ device: "mobile" | "desktop" | "tablet"; clicks: number; impressions: number; ctr: number | null; position: number | null }> = [];
    const countryRows: Array<{ country_code: string; clicks: number; impressions: number; ctr: number | null; position: number | null }> = [];
    const topPageRows: Array<{ page_url: string; clicks: number; impressions: number; ctr: number | null; position: number | null }> = [];
    let inspection: Awaited<ReturnType<typeof inspectUrl>> = null;

    const gscIsConfigured = gscConfigured();
    if (!gscIsConfigured) console.warn(`[GSC] skipped: ${gscConfigurationError() ?? "GSC is not configured"}`);
    if (gscIsConfigured) {
      for (const [range, days] of [["7d", 7], ["28d", 28], ["90d", 90]] as const) {
        try {
          const row = (await fetchSearchAnalytics(pageUrl, days))?.rows?.[0];
          const stat: GscStat = { date_range: range, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0, ctr: row?.ctr ?? null, avg_position: row?.position ?? null };
          gscStats.push(stat);
          const { error } = await auditDb.from("seo_audit_gsc_stats").insert({ audit_id: auditId, entity_id: entityId, ...stat });
          if (error) throw error;
        } catch (error) {
          gscErrors.push(reportGscError(`search analytics (${range})`, error));
        }
      }
      const breakdowns: Array<{ name: string; dimensions: string[]; collect: (row: NonNullable<Awaited<ReturnType<typeof fetchSearchAnalytics>>>["rows"][number]) => void }> = [
        { name: "top queries", dimensions: ["query"], collect: (row) => { const query = row.keys?.[0]; if (query) queryRows.push({ query, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? null, position: row.position ?? null }); } },
        { name: "device breakdown", dimensions: ["device"], collect: (row) => { const device = row.keys?.[0]?.toLowerCase(); if (device === "mobile" || device === "desktop" || device === "tablet") deviceRows.push({ device, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? null, position: row.position ?? null }); } },
        { name: "country breakdown", dimensions: ["country"], collect: (row) => { const country = row.keys?.[0]?.toUpperCase(); if (country) countryRows.push({ country_code: country, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? null, position: row.position ?? null }); } },
      ];
      for (const breakdown of breakdowns) {
        try { const rows = (await fetchSearchAnalytics(pageUrl, 28, breakdown.dimensions))?.rows ?? []; rows.forEach(breakdown.collect); } catch (error) { gscErrors.push(reportGscError(`${breakdown.name} (28d)`, error)); }
      }
      try {
        const rows = (await fetchSearchAnalytics(undefined, 28, ["page"]))?.rows ?? [];
        rows.forEach((row) => { const page = row.keys?.[0]; if (page) topPageRows.push({ page_url: page, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? null, position: row.position ?? null }); });
      } catch (error) { gscErrors.push(reportGscError("top pages (28d)", error)); }
      try {
        inspection = await inspectUrl(pageUrl);
        const index = inspection?.inspectionResult?.indexStatusResult as (Record<string, any> | undefined);
        if (index) {
          const { error } = await auditDb.from("seo_audit_gsc_index").insert({ audit_id: auditId, entity_id: entityId, index_status: index.indexingState === "INDEXING_ALLOWED" ? "INDEXED" : "NOT_INDEXED", coverage_state: index.coverageState ?? null, last_crawled_at: index.lastCrawlTime ?? null, crawl_allowed: index.crawlState === "CRAWL_ALLOWED", indexing_allowed: index.indexingState === "INDEXING_ALLOWED", canonical_google: index.googleCanonical ?? null, canonical_matches_ours: index.googleCanonical ? index.googleCanonical === pageUrl : null, mobile_usable: inspection?.inspectionResult?.mobileUsabilityResult?.verdict === "PASS", rich_result_eligible: Boolean(inspection?.inspectionResult?.richResultsResult?.detectedItems?.length) });
          if (error) throw error;
        }
      } catch (error) { gscErrors.push(reportGscError("URL inspection", error)); }

      if (queryRows.length) {
        const { error } = await auditDb.from("seo_audit_query_rankings").insert(queryRows.map((row) => ({ audit_id: auditId, entity_id: entityId, page_url: pageUrl, query: row.query, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position, date_range: "28d" })));
        if (error) gscErrors.push(reportGscError("top queries storage", error));
      }
      if (deviceRows.length) {
        const { error } = await auditDb.from("seo_audit_device_stats").insert(deviceRows.map((row) => ({ audit_id: auditId, entity_id: entityId, ...row, avg_position: row.position, date_range: "28d" })));
        if (error) gscErrors.push(reportGscError("device breakdown storage", error));
      }
      if (countryRows.length) {
        const { error } = await auditDb.from("seo_audit_country_stats").insert(countryRows.map((row) => ({ audit_id: auditId, entity_id: entityId, ...row, avg_position: row.position, date_range: "28d" })));
        if (error) gscErrors.push(reportGscError("country breakdown storage", error));
      }
      if (topPageRows.length) {
        const { error } = await auditDb.from("seo_audit_top_pages").insert(topPageRows.slice(0, 250).map((row) => ({ audit_id: auditId, entity_id: entityId, page_url: row.page_url, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, avg_position: row.position, date_range: "28d" })));
        if (error) gscErrors.push(reportGscError("top pages storage", error));
      }
      const mobileVerdict = inspection?.inspectionResult?.mobileUsabilityResult?.verdict;
      if (mobileVerdict && mobileVerdict !== "PASS") await auditDb.from("seo_audit_gsc_mobile_issues").insert({ audit_id: auditId, entity_id: entityId, issue_code: "GSC_MOBILE_USABILITY_FAIL" });
      const richItems = inspection?.inspectionResult?.richResultsResult?.detectedItems ?? [];
      if (richItems.length) await auditDb.from("seo_audit_gsc_rich_results").insert(richItems.map((item) => ({ audit_id: auditId, entity_id: entityId, result_type: String((item as Record<string, unknown>).richResultsType ?? (item as Record<string, unknown>).type ?? "UNKNOWN"), is_eligible: true })));
    }

    const current28 = gscStats.find((stat) => stat.date_range === "28d");
    const { data: previous28 } = previous?.id ? await auditDb.from("seo_audit_gsc_stats").select("clicks").eq("audit_id", previous.id).eq("date_range", "28d").maybeSingle() : { data: null };
    const previousClicks = previous28?.clicks ?? null;
    const clicksDeltaPercent = current28 && previousClicks !== null && previousClicks > 0 ? ((current28.clicks - previousClicks) / previousClicks) * 100 : null;
    const index = inspection?.inspectionResult?.indexStatusResult as (Record<string, any> | undefined);
    const result = applyGscSignals(structuralResult, { averagePosition: current28?.avg_position ?? null, ctr: current28?.ctr ?? null, impressions28d: current28?.impressions ?? null, clicksDeltaPercent, indexed: index ? index.indexingState === "INDEXING_ALLOWED" : null, mobileUsable: inspection ? inspection.inspectionResult?.mobileUsabilityResult?.verdict === "PASS" : null, richResultCount: inspection?.inspectionResult?.richResultsResult?.detectedItems?.length ?? 0 });

    const { error: scoresError } = await auditDb.from("seo_audit_scores").insert(result.scores.map((score) => ({ audit_id: auditId, ...score })));
    if (scoresError) throw scoresError;
    let createdIssues: Array<{ id: string; issue_code: string }> = [];
    if (result.issues.length) {
      const { data, error: issuesError } = await auditDb.from("seo_audit_issues").insert(result.issues.map((issue) => ({ audit_id: auditId, entity_type: input.entity_type, entity_id: entityId, ...issue }))).select("id,issue_code");
      if (issuesError) throw issuesError;
      createdIssues = data ?? [];
      if (createdIssues.length) {
        const issueByCode = new Map(createdIssues.map((issue) => [issue.issue_code, issue.id]));
        const { error: queueError } = await auditDb.from("seo_content_queue").upsert(result.issues.map((issue) => ({ audit_id: auditId, audit_issue_id: issueByCode.get(issue.issue_code) ?? null, entity_type: input.entity_type, entity_id: entityId, issue_code: issue.issue_code, title: issueTitle(issue.issue_code), recommendation: issue.expected_value, priority: issue.severity, updated_at: new Date().toISOString() })), { onConflict: "entity_type,entity_id,issue_code", ignoreDuplicates: false });
        if (queueError) throw queueError;
      }
    }

    const delta = previous?.score_total == null ? null : result.total - previous.score_total;
    const counts = { critical: result.issues.filter((issue) => issue.severity === "CRITICAL").length, warnings: result.issues.filter((issue) => issue.severity === "WARNING").length, info: result.issues.filter((issue) => issue.severity === "INFO").length };
    const gscStatus = !gscIsConfigured ? "UNAVAILABLE" : gscErrors.length ? "DEGRADED" : "AVAILABLE";
    const { error: finishError } = await auditDb.from("seo_audits").update({ status: "COMPLETED", completed_at: new Date().toISOString(), next_audit_due_at: new Date(Date.now() + 7 * 86400000).toISOString(), score_total: result.total, score_previous_total: previous?.score_total ?? null, score_delta: delta, score_grade: result.grade, issues_count_critical: counts.critical, issues_count_warnings: counts.warnings, issues_count_info: counts.info, gsc_status: gscStatus, gsc_error_count: gscErrors.length }).eq("id", auditId);
    if (finishError) throw finishError;
    const gscNote = !gscIsConfigured
      ? `Audit completed without GSC; ${gscConfigurationError() ?? "configure GSC credentials to enable search data"}`
      : gscErrors.length
        ? `Audit completed with GSC errors: ${gscErrors.map(({ operation, message }) => `${operation}: ${message}`).join(" | ")}`
        : "Audit completed with GSC data";
    await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: entityId, audit_id: auditId, action: "AUDIT_COMPLETED", performed_by: user.id, note: gscNote, metadata: { gsc: { status: gscStatus, errors: gscErrors, stats: gscStats.length, queries: queryRows.length, devices: deviceRows.length, countries: countryRows.length, top_pages: topPageRows.length } } });
    if (delta !== null && delta <= -10) await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: entityId, audit_id: auditId, action: "SCORE_DROPPED", performed_by: user.id, note: `Score dropped by ${Math.abs(delta)} points` });
    return NextResponse.json({ audit_id: auditId, entity_type: input.entity_type, entity_id: entityId, page_url: pageUrl, score: result.total, grade: result.grade, issues: counts, gsc: gscStatus, gsc_errors: gscErrors });
  } catch (error) {
    await auditDb.from("seo_audits").update({ status: "FAILED", completed_at: new Date().toISOString() }).eq("id", auditId);
    await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: entityId, audit_id: auditId, action: "AUDIT_FAILED", performed_by: user.id, note: error instanceof Error ? error.message : "Unknown audit failure" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audit failed", audit_id: auditId }, { status: 500 });
  }
}