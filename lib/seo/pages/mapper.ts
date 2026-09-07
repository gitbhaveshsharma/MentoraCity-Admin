import type { PageSeoFormValues, PageSeoOverride } from "@/lib/seo/pages/types";
import { normalizePath, pathToAbsoluteUrl } from "@/lib/seo/pages/path";
import type { SeoPayload } from "@/lib/types";

export function parseKeywordsInput(value: string): string[] | null {
  const parts = value
    .split(/[,|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

export function formatKeywordsInput(keywords: string[] | null | undefined): string {
  return (keywords ?? []).join(", ");
}

export function emptyPageSeoForm(path: string): PageSeoFormValues {
  const normalized = normalizePath(path);
  const absolute = pathToAbsoluteUrl(normalized) ?? "";
  return {
    path: normalized,
    title: "",
    description: "",
    heading: "",
    subheading: "",
    keywords: "",
    og_title: "",
    og_description: "",
    og_image: "",
    canonical: absolute,
    robots_index: true,
    robots_follow: true,
    page_content: "",
    is_active: true,
  };
}

export function overrideToForm(row: PageSeoOverride): PageSeoFormValues {
  return {
    path: row.path,
    title: row.title,
    description: row.description,
    heading: row.heading ?? "",
    subheading: row.subheading ?? "",
    keywords: formatKeywordsInput(row.keywords),
    og_title: row.og_title ?? "",
    og_description: row.og_description ?? "",
    og_image: row.og_image ?? "",
    canonical: row.canonical ?? pathToAbsoluteUrl(row.path) ?? "",
    robots_index: row.robots_index ?? true,
    robots_follow: row.robots_follow ?? true,
    page_content: row.page_content ?? "",
    is_active: row.is_active,
  };
}

export function formToOverridePayload(values: PageSeoFormValues) {
  return {
    path: normalizePath(values.path),
    title: values.title.trim(),
    description: values.description.trim(),
    heading: values.heading.trim() || null,
    subheading: values.subheading.trim() || null,
    keywords: parseKeywordsInput(values.keywords),
    og_title: values.og_title.trim() || null,
    og_description: values.og_description.trim() || null,
    og_image: values.og_image.trim() || null,
    canonical: values.canonical.trim() || null,
    robots_index: values.robots_index,
    robots_follow: values.robots_follow,
    page_content: values.page_content.trim() || null,
    is_active: values.is_active,
  };
}

export function rowFromDb(raw: Record<string, unknown>): PageSeoOverride {
  return {
    id: String(raw.id),
    path: normalizePath(String(raw.path)),
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    heading: (raw.heading as string | null) ?? null,
    subheading: (raw.subheading as string | null) ?? null,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : null,
    og_title: (raw.og_title as string | null) ?? null,
    og_description: (raw.og_description as string | null) ?? null,
    og_image: (raw.og_image as string | null) ?? null,
    canonical: (raw.canonical as string | null) ?? null,
    robots_index: typeof raw.robots_index === "boolean" ? raw.robots_index : null,
    robots_follow: typeof raw.robots_follow === "boolean" ? raw.robots_follow : null,
    page_content: (raw.page_content as string | null) ?? null,
    is_active: Boolean(raw.is_active ?? true),
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}

/** Seed form fields from a live HTML scrape (SeoPayload). */
export function formFromScrapedSeo(path: string, seo: SeoPayload): PageSeoFormValues {
  const base = emptyPageSeoForm(path);
  const title =
    seo.title.source === "custom" && seo.title.custom
      ? seo.title.custom
      : seo.title.generated;
  const description =
    seo.description.source === "custom" && seo.description.custom
      ? seo.description.custom
      : seo.description.generated;
  return {
    ...base,
    title: title.slice(0, 70),
    description: description.slice(0, 160),
    og_title: seo.og.title?.slice(0, 70) ?? "",
    og_description: seo.og.description?.slice(0, 160) ?? "",
    og_image: seo.og.image ?? "",
    canonical: seo.canonical_url || base.canonical,
    robots_index: seo.robots.index,
    robots_follow: seo.robots.follow,
  };
}

export function overrideSnapshot(
  row: Pick<
    PageSeoOverride,
    | "path"
    | "title"
    | "description"
    | "heading"
    | "subheading"
    | "keywords"
    | "og_title"
    | "og_description"
    | "og_image"
    | "canonical"
    | "robots_index"
    | "robots_follow"
    | "page_content"
    | "is_active"
  > & { version?: number },
): Record<string, unknown> {
  return {
    path: row.path,
    title: row.title,
    description: row.description,
    heading: row.heading,
    subheading: row.subheading,
    keywords: row.keywords,
    og_title: row.og_title,
    og_description: row.og_description,
    og_image: row.og_image,
    canonical: row.canonical,
    robots_index: row.robots_index,
    robots_follow: row.robots_follow,
    page_content: row.page_content,
    is_active: row.is_active,
    version: row.version ?? 1,
  };
}
