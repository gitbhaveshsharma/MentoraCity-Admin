-- ============================================================
-- MentoraCity SEO — Coaching SEO Overrides Table
-- Stores manual SEO metadata overrides for specific URLs.
-- Fetched dynamically by the eduro app to improve page SEO.
-- ============================================================

-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

-- ============================================================
-- Table: coaching_seo_overrides
-- Each row maps one canonical URL path to its SEO overrides.
-- ============================================================
create table if not exists coaching_seo_overrides (
  id              uuid        primary key default gen_random_uuid(),

  -- Canonical URL path key, e.g. '/coaching/bihar/patna'
  -- Stored lowercase, no trailing slash, always starts with '/'
  path            text        not null unique,

  -- Page / Meta Title (required)
  title           text        not null,

  -- Meta Description (required)
  description     text        not null,

  -- Optional H1 heading rendered on the page
  heading         text        null,

  -- Optional subheading text rendered under H1
  subheading      text        null,

  -- Optional keywords stored as a Postgres text array
  keywords        text[]      null,

  -- Optional OpenGraph title override (defaults to title on app side)
  og_title        text        null,

  -- Optional OpenGraph description override (defaults to description on app side)
  og_description  text        null,

  -- Optional canonical URL override (absolute URL)
  canonical       text        null,

  -- Robots directives
  robots_index    boolean     null,
  robots_follow   boolean     null,

  -- Optional extra website content shown on the page (e.g. intro paragraph)
  page_content    text        null,

  -- Control flag — set to false to disable this override without deleting it
  is_active       boolean     not null default true,

  -- Audit timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_coaching_seo_overrides_path
  on coaching_seo_overrides (path);

create index if not exists idx_coaching_seo_overrides_active
  on coaching_seo_overrides (is_active);

-- ============================================================
-- Auto-update updated_at on row change
-- ============================================================
create or replace function set_coaching_seo_override_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_coaching_seo_overrides_updated_at
  on coaching_seo_overrides;

create trigger trg_coaching_seo_overrides_updated_at
  before update on coaching_seo_overrides
  for each row execute function set_coaching_seo_override_updated_at();

-- ============================================================
-- Row Level Security
-- Allow anonymous read of active rows only.
-- Write operations must be done via service role or dashboard.
-- ============================================================
alter table coaching_seo_overrides enable row level security;

-- Public read policy (anon key can fetch active overrides)
drop policy if exists "anon_read_active_overrides" on coaching_seo_overrides;
create policy "anon_read_active_overrides"
  on coaching_seo_overrides
  for select
  using (is_active = true);

-- ============================================================
-- Seed: migrate existing JSON overrides into the table
-- ============================================================
insert into coaching_seo_overrides (path, title, description, subheading, keywords)
values (
  '/coaching/bihar/patna',
  'Best Coaching Centers in Patna, Bihar | Fees & Reviews',
  'Compare coaching centers in Patna for IIT JEE, NEET, UPSC and school exams. See fees, ratings, courses, students reviews and batch details on MentoraCity.',
  'Compare top-rated coaching institutes in Patna for IIT JEE, NEET, UPSC and school boards. Check genuine student reviews, fee structures, and batch details.',
  ARRAY[
    'coaching in patna',
    'best coaching centers in patna',
    'iit jee coaching patna',
    'neet coaching patna',
    'upsc coaching patna',
    'patna coaching institutes',
    'mentoracity'
  ]
)
on conflict (path) do nothing;
