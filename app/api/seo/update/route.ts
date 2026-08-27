import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { type?: "center" | "branch"; id?: string; seo?: Record<string, unknown> } | null;
  if (!body?.id || !body.seo) return NextResponse.json({ error: "id and seo are required" }, { status: 400 });
  let table = body.type === "center" ? "coaching_centers" : "coaching_branches";
  let { data: entity, error: readError } = await supabase.from(table).select("metadata").eq("id", body.id).single();
  // The client may omit the type; safely resolve it by ID without touching unrelated rows.
  if (!entity && table === "coaching_branches") { table = "coaching_centers"; const result = await supabase.from(table).select("metadata").eq("id", body.id).single(); entity = result.data; readError = result.error; }
  if (readError || !entity) return NextResponse.json({ error: readError?.message ?? "Not found" }, { status: 404 });
  const metadata = { ...(entity.metadata ?? {}), seo: { ...(entity.metadata?.seo ?? {}), ...body.seo, version: Number(entity.metadata?.seo?.version ?? 0) + 1 } };
  const { error: updateError } = await supabase.from(table).update({ metadata }).eq("id", body.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ seo: metadata.seo });
}
