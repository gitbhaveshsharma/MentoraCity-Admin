-- ============================================================
-- MentoraCity SEO — Blog CMS
-- Admin writes from this dashboard; mentoracity.com reads published rows.
-- Apply on the SEO AUDIT Supabase project.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- Table: blogs
-- ============================================================
create table if not exists blogs (
  id                   uuid        primary key default gen_random_uuid(),

  slug                 text        not null,
  title                text        not null,
  excerpt              text        null,

  -- TipTap round-trip + sanitized HTML for mentoracity render
  content_html         text        not null default '',
  content_json         jsonb       not null default '{}'::jsonb,

  status               text        not null default 'draft'
                       check (status in ('draft', 'review', 'scheduled', 'published', 'archived')),
  published_at         timestamptz null,
  scheduled_at         timestamptz null,

  -- SEO fields consumed by mentoracity head tags
  meta_title           text        null,
  meta_description     text        null,
  canonical_url        text        null,
  og_image_url         text        null,
  robots_index         boolean     not null default true,

  -- Editorial
  author_name          text        null,
  cover_image_url      text        null,
  tags                 text[]      not null default '{}',
  related_paths        text[]      not null default '{}',

  created_by           uuid        null,
  updated_by           uuid        null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint blogs_slug_unique unique (slug)
);

create index if not exists idx_blogs_status_published
  on blogs (status, published_at desc nulls last);

create index if not exists idx_blogs_updated_at
  on blogs (updated_at desc);

create index if not exists idx_blogs_slug
  on blogs (slug);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function set_blogs_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_blogs_updated_at on blogs;
create trigger trg_blogs_updated_at
  before update on blogs
  for each row execute function set_blogs_updated_at();

-- ============================================================
-- RLS: anon/authenticated may read published posts only.
-- Writes go through service role from the admin dashboard.
-- ============================================================
alter table blogs enable row level security;

drop policy if exists "anon_read_published_blogs" on blogs;
create policy "anon_read_published_blogs"
  on blogs
  for select
  using (status = 'published');

-- ============================================================
-- Storage bucket: blog-media (public read)
-- Create via dashboard if insert into storage.buckets is restricted.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-media',
  'blog-media',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public_read_blog_media" on storage.objects;
create policy "public_read_blog_media"
  on storage.objects
  for select
  using (bucket_id = 'blog-media');

drop policy if exists "service_write_blog_media" on storage.objects;
create policy "service_write_blog_media"
  on storage.objects
  for all
  using (bucket_id = 'blog-media')
  with check (bucket_id = 'blog-media');
