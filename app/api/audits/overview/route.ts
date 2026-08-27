import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";

export async function GET() {
  const production = await createClient(); const { data: { user } } = await production.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (!(await isAdmin(production, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let auditDb: ReturnType<typeof createAuditClient>; try { auditDb = createAuditClient(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }); }
  const [{ data: centers, error: centerError }, { data: audits, error: auditError }] = await Promise.all([
    production.from("coaching_centers").select("id,name,slug,metadata").order("name"),
    auditDb.from("seo_audits").select("id,entity_type,entity_id,page_url,status,triggered_at,completed_at,score_total,score_delta,score_grade,issues_count_critical,issues_count_warnings,issues_count_info").order("triggered_at", { ascending: false }).limit(100),
  ]);
  if (centerError) return NextResponse.json({ error: centerError.message }, { status: 500 }); if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });
  const entityIds = [...new Set((audits ?? []).map((audit) => audit.entity_id))]; const { data: branches } = entityIds.length ? await production.from("coaching_branches").select("id,name,branch_slug,coaching_center_id").in("id", entityIds) : { data: [] };
  const names = new Map<string, string>(); (centers ?? []).forEach((center) => names.set(center.id, center.name)); (branches ?? []).forEach((branch) => names.set(branch.id, branch.name));
  return NextResponse.json({ centers: (centers ?? []).map((center) => ({ id: center.id, name: center.name, type: "center", page_url: center.metadata?.seo?.canonical_url ?? null })), audits: (audits ?? []).map((audit) => ({ ...audit, entity_name: names.get(audit.entity_id) ?? "Unknown entity" })) });
}
