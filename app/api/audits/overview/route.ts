import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";

export async function GET() {
  const production = await createClient();
  const { data: { user } } = await production.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(production, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let auditDb: ReturnType<typeof createAuditClient>;
  try { auditDb = createAuditClient(); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }); }

  const [{ data: centers, error: centerError }, { data: branches, error: branchError }, { data: targets, error: targetError }, { data: audits, error: auditError }] = await Promise.all([
    production.from("coaching_centers").select("id,name,slug,metadata").order("name"),
    production.from("coaching_branches").select("id,name,branch_slug,metadata,coaching_center_id").order("name"),
    auditDb.from("seo_audit_targets").select("id,name,page_url").order("name"),
    auditDb.from("seo_audits").select("id,entity_type,entity_id,page_url,status,triggered_at,completed_at,score_total,score_delta,score_grade,issues_count_critical,issues_count_warnings,issues_count_info,gsc_status,gsc_error_count").order("triggered_at", { ascending: false }).limit(100),
  ]);
  if (centerError) return NextResponse.json({ error: centerError.message }, { status: 500 });
  if (branchError) return NextResponse.json({ error: branchError.message }, { status: 500 });
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

  const centerNames = new Map((centers ?? []).map((center) => [center.id, center.name]));
  const pages = [
    ...(centers ?? []).map((center) => ({ id: center.id, name: center.name, type: "center" as const, page_url: center.metadata?.seo?.canonical_url ?? null })),
    ...(branches ?? []).map((branch) => ({ id: branch.id, name: branch.name, type: "branch" as const, page_url: branch.metadata?.seo?.canonical_url ?? null, parent_id: branch.coaching_center_id, parent_name: centerNames.get(branch.coaching_center_id) ?? null })),
    ...(targets ?? []).map((target) => ({ id: target.id, name: target.name, type: "page" as const, page_url: target.page_url })),
  ];
  const names = new Map<string, string>();
  (centers ?? []).forEach((center) => names.set(center.id, center.name));
  (branches ?? []).forEach((branch) => names.set(branch.id, branch.name));
  (targets ?? []).forEach((target) => names.set(target.id, target.name));
  return NextResponse.json({
    centers: pages.filter((page) => page.type === "center"),
    pages,
    audits: (audits ?? []).map((audit) => ({ ...audit, entity_name: names.get(audit.entity_id) ?? "Unknown page" })),
  });
}