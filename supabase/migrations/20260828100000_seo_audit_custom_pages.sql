-- Persist audit targets that are not represented by a coaching center or branch.
-- Custom targets are still restricted to the configured Search Console property/domain.
alter type entity_type add value if not exists 'page';

create table if not exists seo_audit_targets (
  id uuid primary key default gen_random_uuid(),
  page_url text not null unique,
  name text not null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_seo_audit_targets_url on seo_audit_targets(page_url);
create or replace function set_seo_audit_target_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_seo_audit_targets_updated_at on seo_audit_targets;
create trigger trg_seo_audit_targets_updated_at before update on seo_audit_targets for each row execute function set_seo_audit_target_updated_at();