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

export type UrlIndexStatus = "INDEXED" | "NOT_INDEXED" | "EXCLUDED" | "ERROR" | "UNKNOWN";

export type UrlInspectionRecord = {
  page_url: string;
  path: string;
  index_status: UrlIndexStatus;
  coverage_state: string | null;
  verdict: string | null;
  last_crawled_at: string | null;
  crawl_allowed: boolean | null;
  indexing_allowed: boolean | null;
  canonical_google: string | null;
  robots_index: boolean | null;
  page_fetch_state: string | null;
  live_status: string | null;
  live_http_status: number | null;
  performance_score: number | null;
  seo_score: number | null;
  accessibility_score: number | null;
  screenshot_data_url: string | null;
  inspected_at: string | null;
  live_tested_at: string | null;
  index_requested_at: string | null;
  index_request_type: string | null;
  index_notify_time: string | null;
  index_request_error: string | null;
  gsc_error: string | null;
  live_error: string | null;
};

export type SitemapUrlRow = {
  path: string;
  page_url: string;
  has_override: boolean;
  inspection: UrlInspectionRecord | null;
};

export type PageSitemapPayload = {
  sitemaps: GscSitemapEntry[];
  urls: SitemapUrlRow[];
  origin: string | null;
  synced_at: string;
};
