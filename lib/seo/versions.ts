import { createAuditClient } from "@/lib/supabase/audit";
import type { SeoPayload } from "@/lib/types";
import {
  SEO_VERSION_RETENTION_DAYS,
  asSeoPayload,
  computeExpiresAt,
  diffSeoFields,
  summarizeChangedFields,
  type RecordSeoVersionInput,
  type SeoVersionDailyStat,
  type SeoVersionEntityType,
  type SeoVersionFieldStat,
  type SeoVersionRow,
  type SeoVersionStats,
} from "@/lib/seo/version-types";

export {
  SEO_VERSION_RETENTION_DAYS,
  SEO_VERSION_TRACKED_FIELDS,
  asSeoPayload,
  computeExpiresAt,
  daysUntilExpiry,
  diffSeoFields,
  summarizeChangedFields,
} from "@/lib/seo/version-types";
export type {
  RecordSeoVersionInput,
  SeoVersionDailyStat,
  SeoVersionEntityType,
  SeoVersionFieldStat,
  SeoVersionRow,
  SeoVersionSource,
  SeoVersionStats,
  SeoVersionTrackedField,
} from "@/lib/seo/version-types";

type AuditClient = ReturnType<typeof createAuditClient>;

function getAuditDb(): AuditClient | null {
  try {
    return createAuditClient();
  } catch {
    return null;
  }
}

function toRow(raw: Record<string, unknown>): SeoVersionRow {
  return {
    id: String(raw.id),
    entity_type: raw.entity_type as SeoVersionEntityType,
    entity_id: String(raw.entity_id),
    entity_name: (raw.entity_name as string | null) ?? null,
    version_number: Number(raw.version_number),
    seo: asSeoPayload(raw.seo) ?? (raw.seo as SeoPayload),
    previous_seo: asSeoPayload(raw.previous_seo),
    changed_fields: Array.isArray(raw.changed_fields)
      ? raw.changed_fields.map(String)
      : [],
    change_summary: (raw.change_summary as string | null) ?? null,
    source: raw.source as SeoVersionRow["source"],
    restored_from_id: (raw.restored_from_id as string | null) ?? null,
    created_by: (raw.created_by as string | null) ?? null,
    created_at: String(raw.created_at),
    expires_at: String(raw.expires_at),
  };
}

/** Deletes expired version rows. Safe no-op when audit DB is missing. */
export async function purgeExpiredSeoVersions(
  client?: AuditClient,
): Promise<number> {
  const auditDb = client ?? getAuditDb();
  if (!auditDb) return 0;
  const { data, error } = await auditDb.rpc("purge_expired_seo_versions");
  if (error) {
    console.error("[seo-versions] purge failed", error.message);
    return 0;
  }
  return typeof data === "number" ? data : Number(data ?? 0);
}

/**
 * Persists a SEO snapshot after a successful production write.
 * Failures are logged and swallowed so live SEO saves are never blocked.
 */
export async function recordSeoVersion(
  input: RecordSeoVersionInput,
): Promise<SeoVersionRow | null> {
  const auditDb = getAuditDb();
  if (!auditDb) {
    console.warn("[seo-versions] audit database not configured; skipping snapshot");
    return null;
  }

  const previous =
    input.previousSeo && typeof input.previousSeo === "object"
      ? (input.previousSeo as Record<string, unknown>)
      : null;
  const next = input.seo as Record<string, unknown>;
  const changedFields = diffSeoFields(previous, next);
  const versionNumber = Number(next.version ?? 1);
  const createdAt = new Date();
  const payload = {
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_name: input.entityName ?? null,
    version_number: Number.isFinite(versionNumber) && versionNumber > 0 ? versionNumber : 1,
    seo: next,
    previous_seo: previous,
    changed_fields: changedFields,
    change_summary: summarizeChangedFields(changedFields),
    source: input.source ?? "manual",
    restored_from_id: input.restoredFromId ?? null,
    created_by: input.createdBy ?? null,
    created_at: createdAt.toISOString(),
    expires_at: computeExpiresAt(createdAt).toISOString(),
  };

  const { data, error } = await auditDb
    .from("seo_versions")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("[seo-versions] insert failed", error.message);
    return null;
  }
  return toRow(data as Record<string, unknown>);
}

export type ListSeoVersionsParams = {
  entityType?: SeoVersionEntityType;
  entityId?: string;
  source?: string;
  from?: string;
  to?: string;
  day?: string;
  limit?: number;
  offset?: number;
};

export async function listSeoVersions(
  params: ListSeoVersionsParams = {},
): Promise<{ versions: SeoVersionRow[]; purged: number }> {
  const auditDb = getAuditDb();
  if (!auditDb) return { versions: [], purged: 0 };

  const purged = await purgeExpiredSeoVersions(auditDb);
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = auditDb
    .from("seo_versions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.entityType) query = query.eq("entity_type", params.entityType);
  if (params.entityId) query = query.eq("entity_id", params.entityId);
  if (params.source) query = query.eq("source", params.source);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);
  if (params.day) {
    const start = `${params.day}T00:00:00.000Z`;
    const endDate = new Date(`${params.day}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    query = query.gte("created_at", start).lt("created_at", endDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return {
    versions: (data ?? []).map((row) => toRow(row as Record<string, unknown>)),
    purged,
  };
}

export async function getSeoVersionById(
  versionId: string,
): Promise<SeoVersionRow | null> {
  const auditDb = getAuditDb();
  if (!auditDb) return null;
  const { data, error } = await auditDb
    .from("seo_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toRow(data as Record<string, unknown>);
}

function startOfUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekAgoIso(now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
}

function buildDailySeries(
  rows: Array<{ created_at: string; source: string; changed_fields: string[] }>,
  retentionDays: number,
  now = new Date(),
): SeoVersionDailyStat[] {
  const byDay = new Map<string, SeoVersionDailyStat>();
  for (let i = retentionDays - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime());
    day.setUTCDate(day.getUTCDate() - i);
    const key = startOfUtcDay(day);
    byDay.set(key, { date: key, saves: 0, restores: 0, fields_changed: 0 });
  }
  for (const row of rows) {
    const key = startOfUtcDay(new Date(row.created_at));
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (row.source === "restore") bucket.restores += 1;
    else bucket.saves += 1;
    bucket.fields_changed += row.changed_fields?.length ?? 0;
  }
  return Array.from(byDay.values());
}

export async function getSeoVersionStats(): Promise<SeoVersionStats> {
  const auditDb = getAuditDb();
  const empty: SeoVersionStats = {
    retention_days: SEO_VERSION_RETENTION_DAYS,
    total_versions: 0,
    versions_this_week: 0,
    restores_this_week: 0,
    entities_touched: 0,
    avg_fields_changed: 0,
    daily: buildDailySeries([], SEO_VERSION_RETENTION_DAYS),
    field_breakdown: [],
    purged: 0,
  };
  if (!auditDb) return empty;

  const purged = await purgeExpiredSeoVersions(auditDb);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - SEO_VERSION_RETENTION_DAYS);

  const { data, error } = await auditDb
    .from("seo_versions")
    .select("entity_type,entity_id,source,changed_fields,created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    entity_type: string;
    entity_id: string;
    source: string;
    changed_fields: string[] | null;
    created_at: string;
  }>;

  const weekCutoff = weekAgoIso();
  const entities = new Set<string>();
  const fieldCounts = new Map<string, number>();
  let fieldChangeTotal = 0;
  let versionsThisWeek = 0;
  let restoresThisWeek = 0;

  for (const row of rows) {
    entities.add(`${row.entity_type}:${row.entity_id}`);
    const fields = row.changed_fields ?? [];
    fieldChangeTotal += fields.length;
    for (const field of fields) {
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    }
    if (row.created_at >= weekCutoff) {
      versionsThisWeek += 1;
      if (row.source === "restore") restoresThisWeek += 1;
    }
  }

  const field_breakdown: SeoVersionFieldStat[] = Array.from(fieldCounts.entries())
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  return {
    retention_days: SEO_VERSION_RETENTION_DAYS,
    total_versions: rows.length,
    versions_this_week: versionsThisWeek,
    restores_this_week: restoresThisWeek,
    entities_touched: entities.size,
    avg_fields_changed: rows.length
      ? Math.round((fieldChangeTotal / rows.length) * 10) / 10
      : 0,
    daily: buildDailySeries(
      rows.map((row) => ({
        created_at: row.created_at,
        source: row.source,
        changed_fields: row.changed_fields ?? [],
      })),
      SEO_VERSION_RETENTION_DAYS,
    ),
    field_breakdown,
    purged,
  };
}
