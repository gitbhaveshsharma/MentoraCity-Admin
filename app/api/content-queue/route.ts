import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";

const statuses = ["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"] as const;

async function getAuditDb() {
  const production = await createClient();
  const { data: { user } } = await production.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await isAdmin(production, user))) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  try { return { auditDb: createAuditClient(), production }; } catch (error) { return { response: NextResponse.json({ error: error instanceof Error ? error.message : "Audit database is not configured" }, { status: 503 }) }; }
}

export async function GET() {
  const result = await getAuditDb();
  if (result.response) return result.response;
  const { data, error } = await result.auditDb.from("seo_content_queue").select("id,audit_id,audit_issue_id,entity_type,entity_id,issue_code,title,recommendation,priority,status,created_at,updated_at").order("status").order("priority").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = data ?? [];
  const centerIds = items.filter((item) => item.entity_type === "center").map((item) => item.entity_id);
  const branchIds = items.filter((item) => item.entity_type === "branch").map((item) => item.entity_id);
  const pageIds = items.filter((item) => item.entity_type === "page").map((item) => item.entity_id);
  const [{ data: centers }, { data: branches }, { data: pages }] = await Promise.all([
    centerIds.length ? result.production.from("coaching_centers").select("id,name").in("id", centerIds) : { data: [] },
    branchIds.length ? result.production.from("coaching_branches").select("id,name").in("id", branchIds) : { data: [] },
    pageIds.length ? result.auditDb.from("seo_audit_targets").select("id,name").in("id", pageIds) : { data: [] },
  ]);
  const names = new Map<string, string>();
  (centers ?? []).forEach((center) => names.set(center.id, center.name));
  (branches ?? []).forEach((branch) => names.set(branch.id, branch.name));
  (pages ?? []).forEach((page) => names.set(page.id, page.name));
  return NextResponse.json({ items: items.map((item) => ({ ...item, entity_name: names.get(item.entity_id) ?? "Unknown page" })) });
}

export async function PATCH(request: Request) {
  const result = await getAuditDb();
  if (result.response) return result.response;
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.status !== "string" || !statuses.includes(body.status as typeof statuses[number])) return NextResponse.json({ error: "A valid item id and status are required" }, { status: 400 });
  const { data, error } = await result.auditDb.from("seo_content_queue").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", body.id).select("id,status").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Queue item not found" }, { status: 404 });
  return NextResponse.json({ item: data });
}