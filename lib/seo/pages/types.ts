export type PageSeoOverride = {
  id: string;
  path: string;
  title: string;
  description: string;
  heading: string | null;
  subheading: string | null;
  keywords: string[] | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  canonical: string | null;
  robots_index: boolean | null;
  robots_follow: boolean | null;
  page_content: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PageSeoFormValues = {
  path: string;
  title: string;
  description: string;
  heading: string;
  subheading: string;
  keywords: string;
  og_title: string;
  og_description: string;
  og_image: string;
  canonical: string;
  robots_index: boolean;
  robots_follow: boolean;
  page_content: string;
  is_active: boolean;
};

export type PageOverviewRow = {
  path: string;
  page_url: string;
  has_override: boolean;
  override_id: string | null;
  is_active: boolean | null;
  title: string | null;
  score_total: number | null;
  score_grade: string | null;
  impressions: number | null;
  clicks: number | null;
  avg_position: number | null;
  last_crawled_at: string | null;
  top_keywords: string[];
  in_sitemap: boolean;
  audit_id: string | null;
};

export type GscSitemapEntry = {
  path: string;
  lastSubmitted: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  errors: string | null;
  warnings: string | null;
};

export type PageSitemapPayload = {
  sitemaps: GscSitemapEntry[];
  urls: Array<{ path: string; page_url: string; has_override: boolean }>;
  origin: string | null;
  synced_at: string;
};
