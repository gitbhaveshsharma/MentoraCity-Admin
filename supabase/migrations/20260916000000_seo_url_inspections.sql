-- URL Inspection + live test snapshots for sitemap indexing workflow.
create table if not exists seo_url_inspections (
  id uuid primary key default gen_random_uuid(),
  page_url text not null unique,
  path text not null,
  index_status index_status not null default 'UNKNOWN',
  coverage_state text null,
  verdict text null,
  last_crawled_at timestamptz null,
  crawl_allowed boolean null,
  indexing_allowed boolean null,
  canonical_google text null,
  robots_index boolean null,
  page_fetch_state text null,
  live_status text null,
  live_http_status integer null,
  performance_score integer null check (performance_score is null or performance_score between 0 and 100),
  seo_score integer null check (seo_score is null or seo_score between 0 and 100),
  accessibility_score integer null check (accessibility_score is null or accessibility_score between 0 and 100),
  screenshot_data_url text null,
  inspected_at timestamptz not null default now(),
  live_tested_at timestamptz null,
  index_requested_at timestamptz null,
  index_request_type text null,
  index_notify_time timestamptz null,
  index_request_error text null,
  gsc_error text null,
  live_error text null,
  inspected_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_url_inspections_status on seo_url_inspections(index_status);
create index if not exists idx_url_inspections_path on seo_url_inspections(path);
create index if not exists idx_url_inspections_inspected_at on seo_url_inspections(inspected_at desc);

drop trigger if exists trg_seo_url_inspections_updated_at on seo_url_inspections;
create trigger trg_seo_url_inspections_updated_at before update on seo_url_inspections
  for each row execute function set_seo_audit_updated_at();
