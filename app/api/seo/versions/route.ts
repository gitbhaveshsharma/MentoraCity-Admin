import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { listSeoVersions } from "@/lib/seo/versions";
import type { SeoVersionEntityType } from "@/lib/seo/version-types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type") as SeoVersionEntityType | null;
  const entityId = searchParams.get("entity_id");
  const source = searchParams.get("source");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const day = searchParams.get("day");
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  if (entityType && entityType !== "center" && entityType !== "branch") {
    return NextResponse.json(
      { error: "entity_type must be center or branch" },
      { status: 400 },
    );
  }

  try {
    const { versions, purged } = await listSeoVersions({
      entityType: entityType ?? undefined,
      entityId: entityId ?? undefined,
      source: source ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      day: day ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json({ versions, purged });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load versions" },
      { status: 500 },
    );
  }
}
