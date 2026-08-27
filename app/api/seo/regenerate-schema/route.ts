import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { type?: "center" | "branch"; id?: string } | null;
  if (!body?.id || !body.type) return NextResponse.json({ error: "type and id are required" }, { status: 400 });
  let table = body.type === "center" ? "coaching_centers" : "coaching_branches";
  let { data: entity, error: fetchError } = await supabase.from(table).select("id,name,description,metadata").eq("id", body.id).single();
  if (!entity && table === "coaching_branches") { table = "coaching_centers"; const result = await supabase.from(table).select("id,name,description,metadata").eq("id", body.id).single(); entity = result.data; fetchError = result.error; }
  if (fetchError || !entity) return NextResponse.json({ error: fetchError?.message ?? "Not found" }, { status: 404 });
  const current = (entity.metadata?.seo ?? {}) as Record<string, unknown>;
  const schema = { "@context": "https://schema.org", "@type": "EducationalOrganization", name: entity.name, description: entity.description, url: current.canonical_url ?? null, ...(body.type === "branch" ? { parentOrganization: { "@type": "EducationalOrganization", name: "MentoraCity" } } : {}) };
  const metadata = { ...(entity.metadata ?? {}), seo: { ...current, schema, version: Number(current.version ?? 0) + 1 } };
  const { error: updateError } = await supabase.from(table).update({ metadata }).eq("id", body.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ schema });
}
