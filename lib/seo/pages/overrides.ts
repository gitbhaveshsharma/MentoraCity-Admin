import { createAuditClient } from "@/lib/supabase/audit";
import {
  formToOverridePayload,
  formatKeywordsInput,
  overrideSnapshot,
  rowFromDb,
} from "@/lib/seo/pages/mapper";
import {
  normalizePath,
  pathToAbsoluteUrl,
} from "@/lib/seo/pages/path";
import type { PageSeoFormValues, PageSeoOverride } from "@/lib/seo/pages/types";
import { listSeoVersions, recordSeoVersion } from "@/lib/seo/versions";
import {
  PAGE_CACHE_KEYS,
  invalidateServerCache,
} from "@/lib/serverCache";

function auditDb() {
  return createAuditClient();
}

export async function listOverrides(): Promise<PageSeoOverride[]> {
  const { data, error } = await auditDb()
    .from("coaching_seo_overrides")
    .select("*")
    .order("path");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowFromDb(row as Record<string, unknown>));
}

export async function getOverrideByPath(path: string): Promise<PageSeoOverride | null> {
  const normalized = normalizePath(path);
  const { data, error } = await auditDb()
    .from("coaching_seo_overrides")
    .select("*")
    .eq("path", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowFromDb(data as Record<string, unknown>);
}

export async function getOverrideById(id: string): Promise<PageSeoOverride | null> {
  const { data, error } = await auditDb()
    .from("coaching_seo_overrides")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowFromDb(data as Record<string, unknown>);
}

async function nextPageVersionNumber(overrideId: string | null): Promise<number> {
  if (!overrideId) return 1;
  try {
    const { versions } = await listSeoVersions({
      entityType: "page",
      entityId: overrideId,
      limit: 1,
    });
    const latest = versions[0]?.version_number ?? 0;
    return latest + 1;
  } catch {
    return 1;
  }
}

export async function upsertOverride(
  values: PageSeoFormValues,
  options: {
    userId?: string | null;
    source?: "manual" | "restore";
    restoredFromId?: string | null;
  } = {},
): Promise<PageSeoOverride> {
  const db = auditDb();
  const payload = formToOverridePayload(values);
  const previous = await getOverrideByPath(payload.path);

  const { data, error } = await db
    .from("coaching_seo_overrides")
    .upsert(payload, { onConflict: "path" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const saved = rowFromDb(data as Record<string, unknown>);
  const versionNumber = await nextPageVersionNumber(previous?.id ?? null);

  await recordSeoVersion({
    entityType: "page",
    entityId: saved.id,
    entityName: saved.path,
    seo: overrideSnapshot({ ...saved, version: versionNumber }),
    previousSeo: previous
      ? overrideSnapshot({ ...previous, version: Math.max(1, versionNumber - 1) })
      : null,
    source: options.source ?? "manual",
    restoredFromId: options.restoredFromId ?? null,
    createdBy: options.userId ?? null,
  });

  await upsertAuditTargetForPath(saved.path, saved.title);
  invalidateServerCache([
    PAGE_CACHE_KEYS.overview,
    PAGE_CACHE_KEYS.sitemapPayload,
  ]);
  return saved;
}

export async function upsertOverrideFromSnapshot(
  snapshot: Record<string, unknown>,
  options: { userId?: string | null; restoredFromId?: string | null } = {},
): Promise<PageSeoOverride> {
  const path = normalizePath(String(snapshot.path ?? ""));
  const form: PageSeoFormValues = {
    path,
    title: String(snapshot.title ?? ""),
    description: String(snapshot.description ?? ""),
    heading: String(snapshot.heading ?? ""),
    subheading: String(snapshot.subheading ?? ""),
    keywords: Array.isArray(snapshot.keywords)
      ? formatKeywordsInput(snapshot.keywords.map(String))
      : String(snapshot.keywords ?? ""),
    og_title: String(snapshot.og_title ?? ""),
    og_description: String(snapshot.og_description ?? ""),
    og_image: String(snapshot.og_image ?? ""),
    canonical: String(snapshot.canonical ?? pathToAbsoluteUrl(path) ?? ""),
    robots_index: snapshot.robots_index !== false,
    robots_follow: snapshot.robots_follow !== false,
    page_content: String(snapshot.page_content ?? ""),
    is_active: snapshot.is_active !== false,
  };
  return upsertOverride(form, {
    userId: options.userId,
    source: "restore",
    restoredFromId: options.restoredFromId,
  });
}

async function upsertAuditTargetForPath(path: string, title: string) {
  const pageUrl = pathToAbsoluteUrl(path);
  if (!pageUrl) return;
  try {
    const { error } = await auditDb().from("seo_audit_targets").upsert(
      { page_url: pageUrl, name: title || path },
      { onConflict: "page_url" },
    );
    if (error) console.error("[page-seo] audit target upsert failed", error.message);
  } catch (error) {
    console.warn(
      "[page-seo] audit target upsert failed",
      error instanceof Error ? error.message : error,
    );
  }
}
