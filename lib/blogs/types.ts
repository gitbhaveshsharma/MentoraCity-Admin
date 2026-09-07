export type BlogStatus =
  | "draft"
  | "review"
  | "scheduled"
  | "published"
  | "archived";

export type BlogListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: BlogStatus;
  published_at: string | null;
  scheduled_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  cover_image_url: string | null;
  og_image_url: string | null;
  tags: string[];
  author_name: string | null;
  updated_at: string;
  created_at: string;
  seo_ready: boolean;
};

export type BlogRecord = BlogListItem & {
  content_html: string;
  content_json: Record<string, unknown>;
  canonical_url: string | null;
  robots_index: boolean;
  related_paths: string[];
  created_by: string | null;
  updated_by: string | null;
};

export type BlogUpsertInput = {
  title: string;
  slug: string;
  excerpt?: string | null;
  content_html?: string;
  content_json?: Record<string, unknown>;
  status?: BlogStatus;
  published_at?: string | null;
  scheduled_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  canonical_url?: string | null;
  og_image_url?: string | null;
  robots_index?: boolean;
  author_name?: string | null;
  cover_image_url?: string | null;
  tags?: string[];
  related_paths?: string[];
};

export type BlogListResult = {
  blogs: BlogListItem[];
  total: number;
  page: number;
  page_size: number;
};
