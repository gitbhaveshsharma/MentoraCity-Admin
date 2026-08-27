-- MentoraCity SEO audit log database
-- This project stores audit snapshots only. Production coaching data remains in the app DB.
create extension if not exists pgcrypto;

do $$ begin create type entity_type as enum ('center','branch'); exception when duplicate_object then null; end $$;
do $$ begin create type audit_status as enum ('PENDING','RUNNING','COMPLETED','FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type issue_severity as enum ('CRITICAL','WARNING','INFO'); exception when duplicate_object then null; end $$;
do $$ begin create type score_grade as enum ('EXCELLENT','GOOD','NEEDS_WORK','POOR'); exception when duplicate_object then null; end $$;
do $$ begin create type index_status as enum ('INDEXED','NOT_INDEXED','EXCLUDED','ERROR','UNKNOWN'); exception when duplicate_object then null; end $$;
do $$ begin create type seo_source as enum ('generated','custom'); exception when duplicate_object then null; end $$;
do $$ begin create type date_range as enum ('7d','28d','90d'); exception when duplicate_object then null; end $$;
do $$ begin create type activity_action as enum ('AUDIT_TRIGGERED','AUDIT_COMPLETED','AUDIT_FAILED','ISSUE_OVERRIDDEN','OVERRIDE_EXPIRED','REINDEX_REQUESTED','SCORE_DROPPED','SCORE_IMPROVED'); exception when duplicate_object then null; end $$;

create table if not exists seo_audits (
  id uuid primary key default gen_random_uuid(), entity_type entity_type not null, entity_id uuid not null, page_url text not null,
  status audit_status not null default 'PENDING', triggered_by_user_id uuid null, triggered_at timestamptz not null default now(), completed_at timestamptz null,
  next_audit_due_at timestamptz null, audit_version integer not null default 1 check (audit_version > 0), previous_audit_id uuid null references seo_audits(id),
  score_total integer null check (score_total between 0 and 100), score_previous_total integer null, score_delta integer null,
  score_grade score_grade null, issues_count_critical integer not null default 0 check (issues_count_critical >= 0), issues_count_warnings integer not null default 0 check (issues_count_warnings >= 0), issues_count_info integer not null default 0 check (issues_count_info >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_seo_audits_entity on seo_audits(entity_type,entity_id); create index if not exists idx_seo_audits_page_url on seo_audits(page_url); create index if not exists idx_seo_audits_status on seo_audits(status); create index if not exists idx_seo_audits_triggered_at on seo_audits(triggered_at desc); create index if not exists idx_seo_audits_next_due on seo_audits(next_audit_due_at); create index if not exists idx_seo_audits_score_total on seo_audits(score_total); create index if not exists idx_seo_audits_score_delta on seo_audits(score_delta);

create table if not exists seo_audit_scores (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, dimension text not null, score integer not null check (score between 0 and 100), max_score integer not null default 100 check (max_score > 0), grade score_grade not null, created_at timestamptz not null default now(), constraint uq_audit_score_dimension unique(audit_id,dimension)
);
create index if not exists idx_audit_scores_audit_id on seo_audit_scores(audit_id); create index if not exists idx_audit_scores_dimension on seo_audit_scores(dimension);

create table if not exists seo_audit_issues (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_type entity_type not null, entity_id uuid not null, issue_code text not null, severity issue_severity not null, dimension text not null, description text null, current_value text null, expected_value text null, is_overridden boolean not null default false, override_id uuid null, created_at timestamptz not null default now()
);
create index if not exists idx_audit_issues_audit_id on seo_audit_issues(audit_id); create index if not exists idx_audit_issues_entity on seo_audit_issues(entity_type,entity_id); create index if not exists idx_audit_issues_code on seo_audit_issues(issue_code); create index if not exists idx_audit_issues_severity on seo_audit_issues(severity); create index if not exists idx_audit_issues_dimension on seo_audit_issues(dimension); create index if not exists idx_audit_issues_overridden on seo_audit_issues(is_overridden);

create table if not exists seo_audit_gsc_stats (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, date_range date_range not null, clicks integer not null default 0, impressions integer not null default 0, ctr numeric(5,4) null check (ctr between 0 and 1), avg_position numeric(6,2) null check (avg_position >= 0), captured_at timestamptz not null default now(), constraint uq_gsc_stats_audit_range unique(audit_id,date_range)
);
create index if not exists idx_gsc_stats_audit_id on seo_audit_gsc_stats(audit_id); create index if not exists idx_gsc_stats_entity on seo_audit_gsc_stats(entity_id); create index if not exists idx_gsc_stats_range on seo_audit_gsc_stats(date_range);

create table if not exists seo_audit_gsc_index (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, index_status index_status not null default 'UNKNOWN', coverage_state text null, last_crawled_at timestamptz null, crawl_allowed boolean null, indexing_allowed boolean null, canonical_google text null, canonical_matches_ours boolean null, mobile_usable boolean null, rich_result_eligible boolean null, captured_at timestamptz not null default now(), constraint uq_gsc_index_audit unique(audit_id)
);
create index if not exists idx_gsc_index_audit_id on seo_audit_gsc_index(audit_id); create index if not exists idx_gsc_index_entity on seo_audit_gsc_index(entity_id); create index if not exists idx_gsc_index_status on seo_audit_gsc_index(index_status); create index if not exists idx_gsc_index_mobile on seo_audit_gsc_index(mobile_usable); create index if not exists idx_gsc_index_canonical on seo_audit_gsc_index(canonical_matches_ours);

create table if not exists seo_audit_gsc_mobile_issues (id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, issue_code text not null, created_at timestamptz not null default now());
create index if not exists idx_mobile_issues_audit_id on seo_audit_gsc_mobile_issues(audit_id); create index if not exists idx_mobile_issues_entity on seo_audit_gsc_mobile_issues(entity_id); create index if not exists idx_mobile_issues_code on seo_audit_gsc_mobile_issues(issue_code);

create table if not exists seo_audit_gsc_rich_results (id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, result_type text not null, is_eligible boolean not null default false, created_at timestamptz not null default now());
create index if not exists idx_rich_results_audit_id on seo_audit_gsc_rich_results(audit_id); create index if not exists idx_rich_results_entity on seo_audit_gsc_rich_results(entity_id);

create table if not exists seo_audit_query_rankings (id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, page_url text not null, query text not null, clicks integer not null default 0, impressions integer not null default 0, ctr numeric(5,4) null check (ctr between 0 and 1), position numeric(6,2) null check (position >= 0), date_range date_range not null, captured_at timestamptz not null default now());
create index if not exists idx_query_rankings_audit_id on seo_audit_query_rankings(audit_id); create index if not exists idx_query_rankings_entity on seo_audit_query_rankings(entity_id); create index if not exists idx_query_rankings_query on seo_audit_query_rankings(query); create index if not exists idx_query_rankings_position on seo_audit_query_rankings(position); create index if not exists idx_query_rankings_captured on seo_audit_query_rankings(captured_at desc);

create table if not exists seo_audit_device_stats (id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, device text not null check (device in ('mobile','desktop','tablet')), date_range date_range not null, clicks integer not null default 0, impressions integer not null default 0, ctr numeric(5,4) null check (ctr between 0 and 1), avg_position numeric(6,2) null check (avg_position >= 0), captured_at timestamptz not null default now(), constraint uq_device_stats_audit_device unique(audit_id,device,date_range));
create index if not exists idx_device_stats_audit_id on seo_audit_device_stats(audit_id); create index if not exists idx_device_stats_entity on seo_audit_device_stats(entity_id); create index if not exists idx_device_stats_device on seo_audit_device_stats(device);

create table if not exists seo_audit_country_stats (id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade, entity_id uuid not null, country_code text not null check (length(country_code) between 2 and 3), date_range date_range not null, clicks integer not null default 0, impressions integer not null default 0, ctr numeric(5,4) null check (ctr between 0 and 1), avg_position numeric(6,2) null check (avg_position >= 0), captured_at timestamptz not null default now());
create index if not exists idx_country_stats_audit_id on seo_audit_country_stats(audit_id); create index if not exists idx_country_stats_entity on seo_audit_country_stats(entity_id); create index if not exists idx_country_stats_country on seo_audit_country_stats(country_code);

create table if not exists seo_audit_position_history (id uuid primary key default gen_random_uuid(), entity_type entity_type not null, entity_id uuid not null, page_url text not null, recorded_date date not null, clicks integer not null default 0, impressions integer not null default 0, ctr numeric(5,4) null check (ctr between 0 and 1), position numeric(6,2) null check (position >= 0), created_at timestamptz not null default now(), constraint uq_position_history_entity_date unique(entity_id,recorded_date));
create index if not exists idx_position_history_entity on seo_audit_position_history(entity_type,entity_id); create index if not exists idx_position_history_date on seo_audit_position_history(recorded_date desc); create index if not exists idx_position_history_url on seo_audit_position_history(page_url);

create table if not exists seo_issue_overrides (id uuid primary key default gen_random_uuid(), entity_type entity_type not null, entity_id uuid not null, issue_code text not null, reason text null, overridden_by uuid null, overridden_at timestamptz not null default now(), expires_at timestamptz null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint uq_override_entity_issue unique(entity_type,entity_id,issue_code));
create index if not exists idx_overrides_entity on seo_issue_overrides(entity_type,entity_id); create index if not exists idx_overrides_code on seo_issue_overrides(issue_code); create index if not exists idx_overrides_active on seo_issue_overrides(is_active); create index if not exists idx_overrides_expires on seo_issue_overrides(expires_at) where is_active = true;

create table if not exists seo_activity_log (id uuid primary key default gen_random_uuid(), entity_type entity_type null, entity_id uuid null, audit_id uuid null references seo_audits(id) on delete set null, action activity_action not null, performed_by uuid null, note text null, metadata jsonb null, created_at timestamptz not null default now());
create index if not exists idx_activity_log_entity on seo_activity_log(entity_type,entity_id); create index if not exists idx_activity_log_action on seo_activity_log(action); create index if not exists idx_activity_log_user on seo_activity_log(performed_by); create index if not exists idx_activity_log_created on seo_activity_log(created_at desc); create index if not exists idx_activity_log_audit on seo_activity_log(audit_id);

create or replace function set_seo_audit_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_seo_audits_updated_at on seo_audits; create trigger trg_seo_audits_updated_at before update on seo_audits for each row execute function set_seo_audit_updated_at();
drop trigger if exists trg_seo_issue_overrides_updated_at on seo_issue_overrides; create trigger trg_seo_issue_overrides_updated_at before update on seo_issue_overrides for each row execute function set_seo_audit_updated_at();
