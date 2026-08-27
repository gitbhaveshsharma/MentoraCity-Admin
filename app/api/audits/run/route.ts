import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";
import { auditRequestSchema } from "@/lib/validations/audit.schema";
import { normalizeSeo } from "@/lib/types";
import { auditSeo } from "@/lib/audit/engine";
import { fetchSearchAnalytics, gscConfigured, inspectUrl } from "@/lib/gsc";

export async function POST(request: Request) {
  const production = await createClient();
  const { data: { user } } = await production.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(production, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = auditRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const table = input.entity_type === "center" ? "coaching_centers" : "coaching_branches";
  const columns = input.entity_type === "center" ? "id,name,slug,metadata" : "id,name,branch_slug,metadata";
  const { data: entity, error: entityError } = await production.from(table).select(columns).eq("id", input.entity_id).single();
  if (!entity) return NextResponse.json({ error: entityError?.message ?? "Production entity not found" }, { status: 404 });

  const entitySlug = (entity as { slug?: string; branch_slug?: string }).slug ?? (entity as { branch_slug?: string }).branch_slug ?? entity.id;
  const pageUrl = normalizeSeo(entity.metadata, entity.name, entity.metadata?.seo?.canonical_url ?? `${process.env.PUBLIC_SITE_URL ?? ""}/${input.entity_type}/${entitySlug}`).canonical_url;
  let auditDb: ReturnType<typeof createAuditClient>;
  try { auditDb = createAuditClient(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }); }
  const { data: previous } = await auditDb.from("seo_audits").select("id,score_total").eq("entity_type", input.entity_type).eq("entity_id", input.entity_id).eq("status", "COMPLETED").order("triggered_at", { ascending: false }).limit(1).maybeSingle();
  const { data: created, error: createError } = await auditDb.from("seo_audits").insert({ entity_type: input.entity_type, entity_id: input.entity_id, page_url: pageUrl, triggered_by_user_id: user.id, status: "RUNNING", previous_audit_id: previous?.id ?? null }).select("id").single();
  if (createError || !created) return NextResponse.json({ error: createError?.message ?? "Could not create audit" }, { status: 500 });
  const auditId = created.id;
  await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: input.entity_id, audit_id: auditId, action: "AUDIT_TRIGGERED", performed_by: user.id });

  try {
    const result = auditSeo(normalizeSeo(entity.metadata, entity.name, pageUrl));
    await auditDb.from("seo_audit_scores").insert(result.scores.map((score) => ({ audit_id: auditId, ...score })));
    if (result.issues.length) await auditDb.from("seo_audit_issues").insert(result.issues.map((issue) => ({ audit_id: auditId, entity_type: input.entity_type, entity_id: input.entity_id, ...issue })));

    if (gscConfigured()) {
      for (const [range, days] of [["7d", 7], ["28d", 28], ["90d", 90]] as const) {
        const row = (await fetchSearchAnalytics(pageUrl, days))?.rows?.[0];
        await auditDb.from("seo_audit_gsc_stats").insert({ audit_id: auditId, entity_id: input.entity_id, date_range: range, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0, ctr: row?.ctr ?? null, avg_position: row?.position ?? null });
      }
      const inspection = await inspectUrl(pageUrl);
      const index = inspection?.inspectionResult?.indexStatusResult as (Record<string, any> | undefined);
      if (index) await auditDb.from("seo_audit_gsc_index").insert({ audit_id: auditId, entity_id: input.entity_id, index_status: index.indexingState === "INDEXING_ALLOWED" ? "INDEXED" : "NOT_INDEXED", coverage_state: index.coverageState ?? null, last_crawled_at: index.lastCrawlTime ?? null, crawl_allowed: index.crawlState === "CRAWL_ALLOWED", indexing_allowed: index.indexingState === "INDEXING_ALLOWED", canonical_google: index.googleCanonical ?? null, canonical_matches_ours: index.googleCanonical ? index.googleCanonical === pageUrl : null, mobile_usable: inspection?.inspectionResult?.mobileUsabilityResult?.verdict === "PASS", rich_result_eligible: Boolean(inspection?.inspectionResult?.richResultsResult?.detectedItems?.length) });
    }

    const delta = previous?.score_total == null ? null : result.total - previous.score_total;
    const counts = { critical: result.issues.filter((issue) => issue.severity === "CRITICAL").length, warnings: result.issues.filter((issue) => issue.severity === "WARNING").length, info: result.issues.filter((issue) => issue.severity === "INFO").length };
    const { error: finishError } = await auditDb.from("seo_audits").update({ status: "COMPLETED", completed_at: new Date().toISOString(), next_audit_due_at: new Date(Date.now() + 7 * 86400000).toISOString(), score_total: result.total, score_previous_total: previous?.score_total ?? null, score_delta: delta, score_grade: result.grade, issues_count_critical: counts.critical, issues_count_warnings: counts.warnings, issues_count_info: counts.info }).eq("id", auditId);
    if (finishError) throw finishError;
    await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: input.entity_id, audit_id: auditId, action: "AUDIT_COMPLETED", performed_by: user.id, note: gscConfigured() ? "Audit completed with GSC data" : "Audit completed without GSC; configure GOOGLE_SERVICE_ACCOUNT_KEY to enable search data" });
    if (delta !== null && delta <= -10) await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: input.entity_id, audit_id: auditId, action: "SCORE_DROPPED", performed_by: user.id, note: `Score dropped by ${Math.abs(delta)} points` });
    return NextResponse.json({ audit_id: auditId, score: result.total, grade: result.grade, issues: counts, gsc: gscConfigured() });
  } catch (error) {
    await auditDb.from("seo_audits").update({ status: "FAILED", completed_at: new Date().toISOString() }).eq("id", auditId);
    await auditDb.from("seo_activity_log").insert({ entity_type: input.entity_type, entity_id: input.entity_id, audit_id: auditId, action: "AUDIT_FAILED", performed_by: user.id, note: error instanceof Error ? error.message : "Unknown audit failure" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audit failed", audit_id: auditId }, { status: 500 });
  }
}
