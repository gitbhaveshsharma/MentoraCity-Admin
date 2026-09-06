import type { BlogListItem, BlogRecord, BlogStatus } from "@/lib/blogs/types";

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_html?: string;
  content_json?: Record<string, unknown> | null;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url?: string | null;
  og_image_url: string | null;
  robots_index?: boolean | null;
  author_name: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
  related_paths?: string[] | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

export function isSeoReady(row: {
  title: string;
  slug: string;
  meta_title: string | null;
  meta_description: string | null;
  cover_image_url?: string | null;
  og_image_url?: string | null;
}): boolean {
  const metaTitle = (row.meta_title || row.title || "").trim();
  const metaDesc = (row.meta_description || "").trim();
  return Boolean(
    row.slug?.trim() &&
      metaTitle.length >= 30 &&
      metaTitle.length <= 70 &&
      metaDesc.length >= 50 &&
      metaDesc.length <= 160,
  );
}

function asStatus(value: string): BlogStatus {
  if (
    value === "draft" ||
    value === "review" ||
    value === "scheduled" ||
    value === "published" ||
    value === "archived"
  ) {
    return value;
  }
  return "draft";
}

export function mapBlogListItem(row: BlogRow): BlogListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    status: asStatus(row.status),
    published_at: row.published_at,
    scheduled_at: row.scheduled_at,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    cover_image_url: row.cover_image_url,
    og_image_url: row.og_image_url,
    tags: row.tags ?? [],
    author_name: row.author_name,
    updated_at: row.updated_at,
    created_at: row.created_at,
    seo_ready: isSeoReady(row),
  };
}

export function mapBlogRecord(row: BlogRow): BlogRecord {
  return {
    ...mapBlogListItem(row),
    content_html: row.content_html ?? "",
    content_json: (row.content_json as Record<string, unknown>) ?? {},
    canonical_url: row.canonical_url ?? null,
    robots_index: row.robots_index ?? true,
    related_paths: row.related_paths ?? [],
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
  };
}
