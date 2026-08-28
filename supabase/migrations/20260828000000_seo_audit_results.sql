-- Extend audit results with GSC health and actionable content work items.
-- Apply after 20260827000000_seo_audit_logs.sql.

alter table seo_audits add column if not exists gsc_status text not null default 'UNAVAILABLE';
alter table seo_audits drop constraint if exists seo_audits_gsc_status_check;
alter table seo_audits add constraint seo_audits_gsc_status_check check (gsc_status in ('AVAILABLE','DEGRADED','UNAVAILABLE'));
alter table seo_audits add column if not exists gsc_error_count integer not null default 0 check (gsc_error_count >= 0);

create table if not exists seo_audit_top_pages (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade,
  entity_id uuid not null, page_url text not null, clicks integer not null default 0,
  impressions integer not null default 0, ctr numeric(5,4) null check (ctr between 0 and 1),
  avg_position numeric(6,2) null check (avg_position >= 0), date_range date_range not null,
  captured_at timestamptz not null default now(),
  constraint uq_gsc_top_page unique(audit_id,page_url,date_range)
);
create index if not exists idx_gsc_top_pages_audit_id on seo_audit_top_pages(audit_id);
create index if not exists idx_gsc_top_pages_entity on seo_audit_top_pages(entity_id);
create index if not exists idx_gsc_top_pages_clicks on seo_audit_top_pages(clicks desc);

create table if not exists seo_content_queue (
  id uuid primary key default gen_random_uuid(), audit_id uuid not null references seo_audits(id) on delete cascade,
  audit_issue_id uuid null references seo_audit_issues(id) on delete set null,
  entity_type entity_type not null, entity_id uuid not null, issue_code text not null,
  title text not null, recommendation text null, priority issue_severity not null default 'WARNING',
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','DONE','DISMISSED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint uq_content_queue_entity_issue unique(entity_type,entity_id,issue_code)
);
create index if not exists idx_content_queue_status on seo_content_queue(status);
create index if not exists idx_content_queue_entity on seo_content_queue(entity_type,entity_id);
create index if not exists idx_content_queue_priority on seo_content_queue(priority);

create or replace function set_seo_content_queue_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_seo_content_queue_updated_at on seo_content_queue;
create trigger trg_seo_content_queue_updated_at before update on seo_content_queue for each row execute function set_seo_content_queue_updated_at();