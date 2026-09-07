import type { SeoPayload } from "@/lib/types";
import { PAGE_SEO_TRACKED_FIELDS } from "@/lib/validations/page-seo.schema";

/** Days SEO version snapshots are retained before automatic purge. */
export const SEO_VERSION_RETENTION_DAYS = 30;

export type SeoVersionEntityType = "center" | "branch" | "page";
export type SeoVersionSource = "manual" | "bulk" | "restore";

/** Tracked top-level SEO fields used for diffs and analytics (center/branch). */
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
  /** Center/branch SeoPayload or page override snapshot. */
  seo: Record<string, unknown>;
  previous_seo: Record<string, unknown> | null;
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

function trackedFieldsFor(entityType?: SeoVersionEntityType | null): readonly string[] {
  return entityType === "page" ? PAGE_SEO_TRACKED_FIELDS : SEO_VERSION_TRACKED_FIELDS;
}

/** Returns which tracked SEO fields differ between two payloads. */
export function diffSeoFields(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  entityType?: SeoVersionEntityType | null,
): string[] {
  return trackedFieldsFor(entityType).filter(
    (field) =>
      stableStringify(previous?.[field]) !== stableStringify(next?.[field]),
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
  if (!seo.title || !seo.description) return null;
  return seo;
}

export function asVersionSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export type SeoFieldCompareRow = {
  field: string;
  changed: boolean;
  before: string;
  after: string;
};

function formatSeoFieldValue(
  seo: Record<string, unknown> | null | undefined,
  field: string,
  entityType?: SeoVersionEntityType | null,
): string {
  if (!seo) return "—";
  const value = seo[field];
  if (value == null) return "—";

  if (entityType === "page") {
    if (Array.isArray(value)) return value.join(", ") || "—";
    if (typeof value === "boolean") return String(value);
    return String(value) || "—";
  }

  if (field === "title" || field === "description") {
    const block = value as {
      source?: string;
      custom?: string | null;
      generated?: string;
    };
    if (block && typeof block === "object" && ("source" in block || "generated" in block)) {
      const text =
        block.source === "custom" && block.custom?.trim()
          ? block.custom
          : (block.generated ?? "");
      const source = block.source ?? "generated";
      return text ? `[${source}] ${text}` : `[${source}] —`;
    }
  }

  if (field === "canonical_url") return String(value);

  if (field === "robots") {
    const robots = value as { index?: boolean; follow?: boolean };
    return `index=${String(robots.index ?? false)}, follow=${String(robots.follow ?? false)}`;
  }

  if (field === "og" || field === "twitter") {
    const social = value as {
      title?: string;
      description?: string;
      image?: string;
    };
    return (
      [
        social.title ? `title: ${social.title}` : null,
        social.description ? `description: ${social.description}` : null,
        social.image ? `image: ${social.image}` : null,
      ]
        .filter(Boolean)
        .join("\n") || "—"
    );
  }

  if (field === "schema" || typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/** Builds a before/after compare table for a version snapshot. */
export function buildSeoVersionCompare(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  changedFields?: string[] | null,
  entityType?: SeoVersionEntityType | null,
): SeoFieldCompareRow[] {
  const fields = trackedFieldsFor(entityType);
  const changed = new Set(
    changedFields?.length ? changedFields : diffSeoFields(previous, next, entityType),
  );
  return fields.map((field) => ({
    field,
    changed: changed.has(field),
    before: formatSeoFieldValue(previous, field, entityType),
    after: formatSeoFieldValue(next, field, entityType),
  }));
}
