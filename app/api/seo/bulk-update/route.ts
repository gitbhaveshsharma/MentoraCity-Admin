import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { applySeoToProduction, loadProductionSeoEntity } from "@/lib/seo/apply";
import { recordSeoVersion } from "@/lib/seo/versions";
import type { SeoVersionEntityType } from "@/lib/seo/version-types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
    patch?: Record<string, unknown>;
    type?: SeoVersionEntityType;
  } | null;

  if (!body?.ids?.length || !body.patch) {
    return NextResponse.json({ error: "ids and patch are required" }, { status: 400 });
  }

  let updated = 0;
  for (const id of body.ids) {
    const loaded = await loadProductionSeoEntity(supabase, id, body.type ?? "center");
    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    let result;
    try {
      result = await applySeoToProduction(supabase, loaded, body.patch);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not save SEO" },
        { status: 400 },
      );
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await recordSeoVersion({
      entityType: loaded.entityType,
      entityId: loaded.id,
      entityName: loaded.name,
      seo: result.seo,
      previousSeo: loaded.previousSeo,
      source: "bulk",
      createdBy: user.id,
    });
    updated += 1;
  }

  return NextResponse.json({ updated });
}
