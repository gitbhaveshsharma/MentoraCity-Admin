# Page-wise SEO (sitemap + overrides)

Manage SEO for dynamically listed site URLs using path-based overrides consumed by eduro, enriched with GSC sitemap and search analytics.

## Databases

| Concern | Project | Notes |
|---------|---------|-------|
| `coaching_seo_overrides` | **Audit** Supabase (`SEO_AUDIT_SUPABASE_URL`) | Same project as audits/versions. Service role writes; apply page migrations here. |
| `seo_versions` (`entity_type=page`) | **Audit** Supabase | Snapshots keyed by override UUID. |
| `seo_audit_targets` | **Audit** Supabase | Upserted on save so audit/content-queue can attach. |

### Apply migrations

Apply these on the **audit** project (`SEO_AUDIT_SUPABASE_URL`):

- `supabase/migrations/20260828200000_seo_page.sql`
- `supabase/migrations/20260906000000_coaching_seo_overrides_og_image.sql`
- `supabase/migrations/20260906000000_seo_versions_allow_page.sql`

```bash
supabase link --project-ref <audit-project-ref>
supabase db push
```

Do **not** apply page-override SQL to the production coaching database unless eduro is configured to read from there separately.

## Path rules

- Lowercase
- Leading `/`
- No trailing slash (except `/`)
- Identity key for upserts and eduro lookups

Helpers: `lib/seo/pages/path.ts`.

## APIs

| Method | Route | Role |
|--------|-------|------|
| GET | `/api/pages` | Overview: sitemap paths + overrides + GSC + latest page audit |
| POST | `/api/pages/sync` | Refresh overview (re-fetch sitemap + GSC) |
| GET | `/api/pages/sitemap` | GSC submitted sitemaps + parsed URL inventory |
| GET | `/api/pages/by-path?path=` | Override or scraped defaults for the sheet |
| PUT | `/api/pages/override` | Validate + upsert override, version, audit target |

All routes require an authenticated admin.

## UI

- **Pages** (`/pages`) — metrics + table (score, impressions, crawl, keywords, override status) + Edit SEO sheet
- **Sitemap** (`/sitemap`) — GSC sitemap list + URL inventory → same sheet
- Sheet: [`components/seo/PageSeoSheet.tsx`](../components/seo/PageSeoSheet.tsx) — title/description length validation, OG image upload (500KB / 1200×630 warning), robots, page content, versions

## Wiring

- **Versions:** `recordSeoVersion({ entityType: "page", entityId: override.id })`; restore via `/api/seo/versions/restore`
- **Audit / content queue:** save upserts `seo_audit_targets` by absolute URL; run audits from SEO audit as today
- **Eduro:** read active overrides from the audit project (`coaching_seo_overrides where is_active and path = $1`), or sync them to production if the public app uses a different DB.

## Caching

Server-side TTL cache (`lib/serverCache.ts`) avoids re-hitting GSC/sitemap on every request:

| Layer | TTL | Invalidated by |
|-------|-----|----------------|
| Sitemap URL parse + GSC sitemap list | 30 min | Sync sitemap / Refresh |
| GSC page metrics + keywords | 30 min | Sync sitemap |
| Pages overview / sitemap payload | 5 min | Sync, Refresh, override save |

- `GET /api/pages` and `GET /api/pages/sitemap` serve cache when warm
- `POST /api/pages/sync` and `?refresh=1` force rebuild
- Concurrent requests share one in-flight load (no stampedes)

Client session cache (5 min) paints instantly on revisit while the server cache answer is revalidated in the background.

| Path | Role |
|------|------|
| `lib/seo/pages/*` | path, types, mapper, sitemap, overview, overrides |
| `lib/validations/page-seo.schema.ts` | Zod |
| `lib/gsc.ts` → `listSitemaps` | GSC sitemap list |
| `app/api/pages/**` | HTTP |
| `components/seo/PagesDashboard.tsx` | Overview |
| `components/seo/SitemapDashboard.tsx` | Sitemap browser |
| `components/seo/PageSeoSheet.tsx` | Editor |
