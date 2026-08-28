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
    type?: SeoVersionEntityType;
    id?: string;
    seo?: Record<string, unknown>;
  } | null;

  if (!body?.id || !body.seo) {
    return NextResponse.json({ error: "id and seo are required" }, { status: 400 });
  }

  const loaded = await loadProductionSeoEntity(supabase, body.id, body.type);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  let result;
  try {
    result = await applySeoToProduction(supabase, loaded, body.seo);
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
    source: "manual",
    createdBy: user.id,
  });

  return NextResponse.json({ seo: result.seo });
}
