import type { SeoPayload } from "@/lib/types";

/** Days SEO version snapshots are retained before automatic purge. */
export const SEO_VERSION_RETENTION_DAYS = 30;

export type SeoVersionEntityType = "center" | "branch";
export type SeoVersionSource = "manual" | "bulk" | "restore";

/** Tracked top-level SEO fields used for diffs and analytics. */
export const SEO_VERSION_TRACKED_FIELDS = [
  "title",
  "description",
  "canonical_url",
  "robots",
  "og",
  "twitter",
  "schema",
] as const;

export type SeoVersionTrackedField = (typeof SEO_VERSION_TRACKED_FIELDS)[number];

export type SeoVersionRow = {
  id: string;
  entity_type: SeoVersionEntityType;
  entity_id: string;
  entity_name: string | null;
  version_number: number;
  seo: SeoPayload;
  previous_seo: SeoPayload | null;
  changed_fields: string[];
  change_summary: string | null;
  source: SeoVersionSource;
  restored_from_id: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
};

export type RecordSeoVersionInput = {
  entityType: SeoVersionEntityType;
  entityId: string;
  entityName?: string | null;
  seo: SeoPayload | Record<string, unknown>;
  previousSeo?: SeoPayload | Record<string, unknown> | null;
  source?: SeoVersionSource;
  restoredFromId?: string | null;
  createdBy?: string | null;
};

export type SeoVersionDailyStat = {
  date: string;
  saves: number;
  restores: number;
  fields_changed: number;
};

export type SeoVersionFieldStat = {
  field: string;
  count: number;
};

export type SeoVersionStats = {
  retention_days: number;
  total_versions: number;
  versions_this_week: number;
  restores_this_week: number;
  entities_touched: number;
  avg_fields_changed: number;
  daily: SeoVersionDailyStat[];
  field_breakdown: SeoVersionFieldStat[];
  purged: number;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

function fieldValue(
  seo: Record<string, unknown> | null | undefined,
  field: SeoVersionTrackedField,
): unknown {
  if (!seo) return undefined;
  return seo[field];
}

/** Returns which tracked SEO fields differ between two payloads. */
export function diffSeoFields(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): SeoVersionTrackedField[] {
  return SEO_VERSION_TRACKED_FIELDS.filter(
    (field) => stableStringify(fieldValue(previous, field)) !== stableStringify(fieldValue(next, field)),
  );
}

export function summarizeChangedFields(fields: string[]): string | null {
  if (!fields.length) return null;
  return fields.join(", ");
}

export function computeExpiresAt(
  from: Date = new Date(),
  retentionDays: number = SEO_VERSION_RETENTION_DAYS,
): Date {
  const expires = new Date(from.getTime());
  expires.setUTCDate(expires.getUTCDate() + retentionDays);
  return expires;
}

export function daysUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function asSeoPayload(value: unknown): SeoPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const seo = value as SeoPayload;
  if (typeof seo.version !== "number") return null;
  return seo;
}
