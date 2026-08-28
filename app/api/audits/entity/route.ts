import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";

export async function GET(request: Request) {
  const production = await createClient();
  const { data: { user } } = await production.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(production, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const entityType = search.get("entity_type");
  const entityId = search.get("entity_id");
  if (entityType !== "center" && entityType !== "branch") return NextResponse.json({ error: "Valid entity_type is required" }, { status: 400 });
  if (!entityId) return NextResponse.json({ error: "entity_id is required" }, { status: 400 });
  let auditDb: ReturnType<typeof createAuditClient>;
  try { auditDb = createAuditClient(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }); }

  const { data: audit, error: auditError } = await auditDb.from("seo_audits").select("id,entity_type,entity_id,page_url,completed_at,score_total,score_grade,gsc_status,gsc_error_count").eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "COMPLETED").order("triggered_at", { ascending: false }).limit(1).maybeSingle();
  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });
  if (!audit) return NextResponse.json({ audit: null, stats: [], queries: [] });
  const [{ data: stats }, { data: queries }] = await Promise.all([
    auditDb.from("seo_audit_gsc_stats").select("date_range,clicks,impressions,ctr,avg_position").eq("audit_id", audit.id).order("date_range"),
    auditDb.from("seo_audit_query_rankings").select("query,clicks,impressions,ctr,position,date_range").eq("audit_id", audit.id).eq("date_range", "28d").order("clicks", { ascending: false }).limit(5),
  ]);
  const hasStoredGsc = Boolean(stats?.length || queries?.length);
  const gscStatus = audit.gsc_status === "DEGRADED" ? "DEGRADED" : hasStoredGsc ? "AVAILABLE" : audit.gsc_status ?? "UNAVAILABLE";
  return NextResponse.json({ audit: { ...audit, gsc_status: gscStatus, gsc_error_count: audit.gsc_error_count ?? 0 }, stats: stats ?? [], queries: queries ?? [] });
}