-- Production Supabase: extend coaching_seo_overrides for OG image parity with center/branch SEO.
-- Apply to the PRODUCTION project (same as coaching_centers), not the audit project.

alter table coaching_seo_overrides
  add column if not exists og_image text null;

comment on column coaching_seo_overrides.og_image is 'Optional Open Graph image URL override';
