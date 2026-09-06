import { createAuditClient } from "@/lib/supabase/audit";
import { mapBlogListItem, mapBlogRecord } from "@/lib/blogs/mapper";
import { sanitizeBlogHtml } from "@/lib/blogs/sanitize";
import { normalizeSlug, slugifyTitle } from "@/lib/blogs/slug";
import type {
  BlogListResult,
  BlogRecord,
  BlogStatus,
  BlogUpsertInput,
} from "@/lib/blogs/types";

const LIST_COLUMNS =
  "id,slug,title,excerpt,status,published_at,scheduled_at,meta_title,meta_description,cover_image_url,og_image_url,tags,author_name,created_at,updated_at";

const DETAIL_COLUMNS = `${LIST_COLUMNS},content_html,content_json,canonical_url,robots_index,related_paths,created_by,updated_by`;

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function listBlogs(options?: {
  status?: BlogStatus | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<BlogListResult> {
  const audit = createAuditClient();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = audit
    .from("blogs")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const search = options?.search?.trim();
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,slug.ilike.%${search}%,meta_title.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    blogs: (data ?? []).map(mapBlogListItem),
    total: count ?? 0,
    page,
    page_size: pageSize,
  };
}

export async function getBlogById(id: string): Promise<BlogRecord | null> {
  const audit = createAuditClient();
  const { data, error } = await audit
    .from("blogs")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBlogRecord(data) : null;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const audit = createAuditClient();
  let query = audit.from("blogs").select("id").eq("slug", slug).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (data && data.length > 0) {
    throw new Error(`Slug "${slug}" is already in use`);
  }
}

export async function createBlog(
  input: { title: string; slug?: string },
  userId?: string,
): Promise<BlogRecord> {
  const audit = createAuditClient();
  const slug = normalizeSlug(input.slug || slugifyTitle(input.title));
  if (!slug) throw new Error("Could not derive a slug from the title");
  await assertSlugAvailable(slug);

  const { data, error } = await audit
    .from("blogs")
    .insert({
      title: input.title.trim(),
      slug,
      status: "draft",
      content_html: "",
      content_json: { type: "doc", content: [{ type: "paragraph" }] },
      created_by: userId ?? null,
      updated_by: userId ?? null,
    })
    .select(DETAIL_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return mapBlogRecord(data);
}

export async function updateBlog(
  id: string,
  input: BlogUpsertInput,
  userId?: string,
): Promise<BlogRecord> {
  const audit = createAuditClient();
  const slug = normalizeSlug(input.slug);
  if (!slug) throw new Error("Slug is required");
  await assertSlugAvailable(slug, id);

  const contentHtml = sanitizeBlogHtml(input.content_html ?? "");
  const patch: Record<string, unknown> = {
    title: input.title.trim(),
    slug,
    excerpt: emptyToNull(input.excerpt),
    content_html: contentHtml,
    content_json: input.content_json ?? {},
    meta_title: emptyToNull(input.meta_title),
    meta_description: emptyToNull(input.meta_description),
    canonical_url: emptyToNull(input.canonical_url),
    og_image_url: emptyToNull(input.og_image_url),
    robots_index: input.robots_index ?? true,
    author_name: emptyToNull(input.author_name),
    cover_image_url: emptyToNull(input.cover_image_url),
    tags: input.tags ?? [],
    related_paths: input.related_paths ?? [],
    updated_by: userId ?? null,
  };

  if (input.status) patch.status = input.status;
  if (input.published_at !== undefined) {
    patch.published_at = emptyToNull(input.published_at);
  }
  if (input.scheduled_at !== undefined) {
    patch.scheduled_at = emptyToNull(input.scheduled_at);
  }

  const { data, error } = await audit
    .from("blogs")
    .update(patch)
    .eq("id", id)
    .select(DETAIL_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return mapBlogRecord(data);
}

export async function publishBlog(
  id: string,
  userId?: string,
): Promise<BlogRecord> {
  const existing = await getBlogById(id);
  if (!existing) throw new Error("Blog not found");
  if (!existing.title.trim() || !existing.slug.trim()) {
    throw new Error("Title and slug are required before publishing");
  }
  if (!existing.content_html.trim()) {
    throw new Error("Add blog content before publishing");
  }

  const audit = createAuditClient();
  const { data, error } = await audit
    .from("blogs")
    .update({
      status: "published",
      published_at: existing.published_at ?? new Date().toISOString(),
      updated_by: userId ?? null,
    })
    .eq("id", id)
    .select(DETAIL_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return mapBlogRecord(data);
}

export async function uploadBlogMedia(options: {
  file: Buffer;
  contentType: string;
  path: string;
}): Promise<string> {
  const audit = createAuditClient();
  const { error } = await audit.storage.from("blog-media").upload(options.path, options.file, {
    upsert: true,
    contentType: options.contentType,
  });
  if (error) throw new Error(error.message);
  const { data } = audit.storage.from("blog-media").getPublicUrl(options.path);
  return data.publicUrl;
}
