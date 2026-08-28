import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeoPayload } from "@/lib/types";
import type { SeoVersionEntityType } from "@/lib/seo/version-types";

export type ProductionSeoEntity = {
  table: "coaching_centers" | "coaching_branches";
  entityType: SeoVersionEntityType;
  id: string;
  name: string | null;
  metadata: Record<string, unknown> | null;
  previousSeo: Record<string, unknown> | null;
};

function slugFromCanonical(canonical: string): string {
  try {
    const parsed = new URL(canonical);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    throw new Error("Canonical URL must be valid before saving.");
  }
}

export function resolveSeoTable(
  type?: SeoVersionEntityType | string | null,
): "coaching_centers" | "coaching_branches" {
  return type === "center" ? "coaching_centers" : "coaching_branches";
}

/** Load a center/branch row and normalize entity type when the client omits it. */
export async function loadProductionSeoEntity(
  supabase: SupabaseClient,
  id: string,
  type?: SeoVersionEntityType | string | null,
): Promise<ProductionSeoEntity | { error: string; status: number }> {
  let table = resolveSeoTable(type);
  let { data: entity, error } = await supabase
    .from(table)
    .select("id,name,metadata")
    .eq("id", id)
    .maybeSingle();

  if (!entity && (!type || type === "branch")) {
    table = "coaching_centers";
    const result = await supabase
      .from(table)
      .select("id,name,metadata")
      .eq("id", id)
      .maybeSingle();
    entity = result.data;
    error = result.error;
  }

  if (error) return { error: error.message, status: 500 };
  if (!entity) return { error: "Not found", status: 404 };

  const metadata = (entity.metadata ?? null) as Record<string, unknown> | null;
  const previousSeo =
    metadata && typeof metadata.seo === "object" && metadata.seo !== null
      ? (metadata.seo as Record<string, unknown>)
      : null;

  return {
    table,
    entityType: table === "coaching_centers" ? "center" : "branch",
    id: entity.id as string,
    name: (entity.name as string | null) ?? null,
    metadata,
    previousSeo,
  };
}

export type ApplySeoResult =
  | { ok: true; seo: SeoPayload; entity: ProductionSeoEntity }
  | { ok: false; error: string; status: number };

/**
 * Merges SEO into production metadata, bumps version, and optionally syncs slug from canonical.
 */
export async function applySeoToProduction(
  supabase: SupabaseClient,
  entity: ProductionSeoEntity,
  seoPatch: Record<string, unknown>,
): Promise<ApplySeoResult> {
  const previousVersion = Number(entity.previousSeo?.version ?? 0);
  const nextSeo = {
    ...(entity.previousSeo ?? {}),
    ...seoPatch,
    version: previousVersion + 1,
  } as SeoPayload;

  const canonical =
    typeof seoPatch.canonical_url === "string"
      ? seoPatch.canonical_url
      : typeof nextSeo.canonical_url === "string"
        ? nextSeo.canonical_url
        : null;

  let nextSlug: string | null = null;
  if (canonical && "canonical_url" in seoPatch) {
    try {
      nextSlug = slugFromCanonical(canonical);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid canonical URL",
        status: 400,
      };
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(nextSlug)) {
      return {
        ok: false,
        error: "The canonical URL must end with a valid slug.",
        status: 400,
      };
    }
  }

  const metadata = { ...(entity.metadata ?? {}), seo: nextSeo };
  const updates: Record<string, unknown> = { metadata };
  if (nextSlug) {
    updates[entity.table === "coaching_centers" ? "slug" : "branch_slug"] = nextSlug;
  }

  const { error } = await supabase.from(entity.table).update(updates).eq("id", entity.id);
  if (error) return { ok: false, error: error.message, status: 500 };

  return {
    ok: true,
    seo: nextSeo,
    entity: {
      ...entity,
      metadata,
      previousSeo: entity.previousSeo,
    },
  };
}
