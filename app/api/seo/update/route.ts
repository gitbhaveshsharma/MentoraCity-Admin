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
  const canonical = typeof body.seo.canonical_url === "string" ? body.seo.canonical_url : null;
  let nextSlug: string | null = null;
  if (canonical) {
    try {
      const url = new URL(canonical);
      const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      nextSlug = decodeURIComponent(segment).toLowerCase();
    } catch {
      return NextResponse.json({ error: "Canonical URL must be valid before saving." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(nextSlug)) return NextResponse.json({ error: "The canonical URL must end with a valid slug." }, { status: 400 });
  }
  const updates: Record<string, unknown> = { metadata };
  if (nextSlug) updates[table === "coaching_centers" ? "slug" : "branch_slug"] = nextSlug;
  const { error: updateError } = await supabase.from(table).update(updates).eq("id", body.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ seo: metadata.seo });
}
