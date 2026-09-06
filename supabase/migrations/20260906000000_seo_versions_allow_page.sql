-- Audit DB: allow SEO version snapshots for custom/sitemap pages (entity_type = page).

alter table seo_versions drop constraint if exists chk_seo_versions_entity_type;

alter table seo_versions
  add constraint chk_seo_versions_entity_type
  check (entity_type::text in ('center', 'branch', 'page'));

comment on table seo_versions is 'Point-in-time SEO snapshots for centers, branches, and page overrides. Auto-expires after 30 days.';
