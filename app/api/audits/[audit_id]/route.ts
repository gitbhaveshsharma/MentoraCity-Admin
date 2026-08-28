import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ audit_id: string }> }) {
  const production = await createClient();
  const { data: { user } } = await production.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(production, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { audit_id: auditId } = await params;
  let auditDb: ReturnType<typeof createAuditClient>;
  try { auditDb = createAuditClient(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }); }

  const { data: audit, error: auditError } = await auditDb.from("seo_audits").select("id,entity_type,entity_id,page_url,status,triggered_at,completed_at,score_total,score_previous_total,score_delta,score_grade,issues_count_critical,issues_count_warnings,issues_count_info,gsc_status,gsc_error_count").eq("id", auditId).single();
  if (auditError || !audit) return NextResponse.json({ error: auditError?.message ?? "Audit not found" }, { status: 404 });
  const [{ data: scores }, { data: issues }, { data: gscStats }, { data: gscIndex }, { data: queries }, { data: devices }, { data: countries }, { data: topPages }, { data: richResults }, { data: activities }] = await Promise.all([
    auditDb.from("seo_audit_scores").select("dimension,score,max_score,grade").eq("audit_id", auditId).order("dimension"),
    auditDb.from("seo_audit_issues").select("id,issue_code,severity,dimension,description,current_value,expected_value,is_overridden,created_at").eq("audit_id", auditId).order("severity"),
    auditDb.from("seo_audit_gsc_stats").select("date_range,clicks,impressions,ctr,avg_position,captured_at").eq("audit_id", auditId).order("date_range"),
    auditDb.from("seo_audit_gsc_index").select("index_status,coverage_state,last_crawled_at,crawl_allowed,indexing_allowed,canonical_google,canonical_matches_ours,mobile_usable,rich_result_eligible,captured_at").eq("audit_id", auditId).maybeSingle(),
    auditDb.from("seo_audit_query_rankings").select("query,clicks,impressions,ctr,position,date_range").eq("audit_id", auditId).order("clicks", { ascending: false }).limit(20),
    auditDb.from("seo_audit_device_stats").select("device,clicks,impressions,ctr,avg_position,date_range").eq("audit_id", auditId).order("clicks", { ascending: false }),
    auditDb.from("seo_audit_country_stats").select("country_code,clicks,impressions,ctr,avg_position,date_range").eq("audit_id", auditId).order("clicks", { ascending: false }).limit(20),
    auditDb.from("seo_audit_top_pages").select("page_url,clicks,impressions,ctr,avg_position,date_range").eq("audit_id", auditId).order("clicks", { ascending: false }).limit(20),
    auditDb.from("seo_audit_gsc_rich_results").select("result_type,is_eligible").eq("audit_id", auditId).order("result_type"),
    auditDb.from("seo_activity_log").select("action,note,metadata,created_at").eq("audit_id", auditId).order("created_at", { ascending: false }),
  ]);

  const { data: history } = await auditDb.from("seo_audits").select("id,triggered_at,completed_at,score_total,score_delta,score_grade,issues_count_critical,issues_count_warnings,issues_count_info,gsc_status").eq("entity_type", audit.entity_type).eq("entity_id", audit.entity_id).eq("status", "COMPLETED").order("triggered_at", { ascending: true }).limit(50);
  const historyIds = (history ?? []).map((item) => item.id);
  const { data: historyStats } = historyIds.length ? await auditDb.from("seo_audit_gsc_stats").select("audit_id,date_range,clicks,impressions,ctr,avg_position").in("audit_id", historyIds).eq("date_range", "28d") : { data: [] };
  const statsByAudit = new Map((historyStats ?? []).map((stat) => [stat.audit_id, stat]));
  const hasStoredGsc = Boolean(gscStats?.length || gscIndex || queries?.length || devices?.length || countries?.length || topPages?.length || richResults?.length);
  const effectiveGscStatus = audit.gsc_status === "DEGRADED" ? "DEGRADED" : hasStoredGsc ? "AVAILABLE" : audit.gsc_status ?? "UNAVAILABLE";
  const normalizedAudit = { ...audit, gsc_status: effectiveGscStatus, gsc_error_count: audit.gsc_error_count ?? 0 };
  const historyWithGsc = (history ?? []).map((item) => ({ ...item, gsc_28d: statsByAudit.get(item.id) ?? null }));
  return NextResponse.json({ audit: normalizedAudit, scores: scores ?? [], issues: issues ?? [], gsc: { stats: gscStats ?? [], index: gscIndex ?? null, queries: queries ?? [], devices: devices ?? [], countries: countries ?? [], top_pages: topPages ?? [], rich_results: richResults ?? [] }, activities: activities ?? [], history: historyWithGsc });
}