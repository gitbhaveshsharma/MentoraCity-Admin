import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { applySeoToProduction, loadProductionSeoEntity } from "@/lib/seo/apply";
import { getSeoVersionById, recordSeoVersion } from "@/lib/seo/versions";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { version_id?: string } | null;
  if (!body?.version_id) {
    return NextResponse.json({ error: "version_id is required" }, { status: 400 });
  }

  let snapshot;
  try {
    snapshot = await getSeoVersionById(body.version_id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load version" },
      { status: 500 },
    );
  }

  if (!snapshot) {
    return NextResponse.json({ error: "Version not found or expired" }, { status: 404 });
  }

  const loaded = await loadProductionSeoEntity(
    supabase,
    snapshot.entity_id,
    snapshot.entity_type,
  );
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const seoPatch = { ...snapshot.seo } as Record<string, unknown>;
  delete seoPatch.version;

  let result;
  try {
    result = await applySeoToProduction(supabase, loaded, seoPatch);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not restore SEO" },
      { status: 400 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const recorded = await recordSeoVersion({
    entityType: loaded.entityType,
    entityId: loaded.id,
    entityName: loaded.name ?? snapshot.entity_name,
    seo: result.seo,
    previousSeo: loaded.previousSeo,
    source: "restore",
    restoredFromId: snapshot.id,
    createdBy: user.id,
  });

  return NextResponse.json({
    seo: result.seo,
    restored_from: snapshot.id,
    version: recorded,
  });
}
