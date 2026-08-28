-- SEO metadata version history (audit DB).
-- Production coaching SEO still lives in metadata.seo; this table stores snapshots for restore + analytics.
-- Retention: rows expire after 30 days (expires_at). Call purge_expired_seo_versions() from APIs or pg_cron.

do $$ begin
  create type seo_version_source as enum ('manual', 'bulk', 'restore');
exception when duplicate_object then null;
end $$;

create table if not exists seo_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type entity_type not null,
  entity_id uuid not null,
  entity_name text null,
  version_number integer not null check (version_number > 0),
  seo jsonb not null,
  previous_seo jsonb null,
  changed_fields text[] not null default '{}',
  change_summary text null,
  source seo_version_source not null default 'manual',
  restored_from_id uuid null references seo_versions(id) on delete set null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint chk_seo_versions_entity_type check (entity_type::text in ('center', 'branch'))
);

create index if not exists idx_seo_versions_entity_created
  on seo_versions(entity_type, entity_id, created_at desc);
create index if not exists idx_seo_versions_expires
  on seo_versions(expires_at);
create index if not exists idx_seo_versions_created
  on seo_versions(created_at desc);
create index if not exists idx_seo_versions_source
  on seo_versions(source);
create index if not exists idx_seo_versions_changed_fields
  on seo_versions using gin (changed_fields);

create or replace function purge_expired_seo_versions()
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  delete from seo_versions where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on table seo_versions is 'Point-in-time SEO snapshots for centers/branches. Auto-expires after 30 days.';
comment on function purge_expired_seo_versions is 'Deletes seo_versions past expires_at. Safe to run from API or scheduled cron.';
