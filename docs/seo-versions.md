# SEO Version History

Automatic snapshots of coaching-center and branch SEO metadata, with restore and a 30-day retention window.

## Overview

Every successful SEO save (manual sheet edit or bulk update) writes a full snapshot into the **audit Supabase project**. Live SEO continues to live in production `metadata.seo` on `coaching_centers` / `coaching_branches`.

| Concern | Location |
|---------|----------|
| Live SEO | Production DB · `metadata.seo` |
| Version snapshots | Audit DB · `seo_versions` |
| Retention | `expires_at` = created + **30 days** |
| Purge | `purge_expired_seo_versions()` (API lazy purge + optional cron) |

## Apply the migration

```bash
supabase link --project-ref <audit-project-ref>
supabase db push
```

Migration file: `supabase/migrations/20260828200000_seo_versions.sql`

Requires existing audit enums (`entity_type`) from earlier migrations. Configure:

- `SEO_AUDIT_SUPABASE_URL`
- `SEO_AUDIT_SUPABASE_SERVICE_ROLE_KEY`

If the audit DB is not configured, SEO saves still succeed; version inserts are skipped with a server warning.

### Optional nightly purge

```sql
-- Example with pg_cron (enable extension in the audit project first)
select cron.schedule(
  'purge-seo-versions',
  '15 3 * * *',
  $$ select purge_expired_seo_versions(); $$
);
```

List/stats APIs also call purge on each request so expired rows do not linger if cron is unavailable.

## Schema

`seo_versions`

| Column | Purpose |
|--------|---------|
| `entity_type` / `entity_id` | Center or branch |
| `entity_name` | Display label at save time |
| `version_number` | Value from `metadata.seo.version` after save |
| `seo` | Full SEO payload after the change |
| `previous_seo` | Payload before the change (for diffs) |
| `changed_fields` | Tracked fields that differed |
| `change_summary` | Human-readable field list |
| `source` | `manual` · `bulk` · `restore` |
| `restored_from_id` | Prior version id when source is restore |
| `created_by` | Auth user id |
| `expires_at` | Hard delete after this timestamp |

Tracked fields (shared constant `SEO_VERSION_TRACKED_FIELDS`): `title`, `description`, `canonical_url`, `robots`, `og`, `twitter`, `schema`.

Retention days are defined once in app code as `SEO_VERSION_RETENTION_DAYS` (`lib/seo/version-types.ts`) and mirrored in migration comments / `expires_at` calculation.

## APIs

All routes require an authenticated admin (same gate as other SEO routes).

### `GET /api/seo/versions`

Query params: `entity_type`, `entity_id`, `source`, `from`, `to`, `day` (`YYYY-MM-DD`), `limit`, `offset`.

Returns `{ versions, purged }`.

### `GET /api/seo/versions/stats`

Returns retention window metrics: totals, week counts, entities touched, avg fields changed, daily activity series, field breakdown, purge count.

### `POST /api/seo/versions/restore`

Body: `{ "version_id": "<uuid>" }`.

1. Loads the snapshot (404 if missing/expired).
2. Writes SEO to production (version counter increments).
3. Inserts a new version with `source: "restore"` and `restored_from_id`.

History is append-only; restore never rewrites older rows.

### Save hooks

- `POST /api/seo/update` → `source: "manual"`
- `POST /api/seo/bulk-update` → `source: "bulk"`

Version insert failures never fail the production SEO write.

## UI

- **Sidebar** → **SEO versions** (`/seo-versions`) — activity chart, field breakdown, filterable history, restore.
- **SEO Sheet** → section **G · Version history** — retention alert, compact table, preview/restore, link to the dashboard filtered by entity.

Deep link: `/seo-versions?entity_type=branch&entity_id=<uuid>`.

### Compare (before / after)

On `/seo-versions`, click a history row (or **Compare**) to open a field-level diff:

- **Before** = `previous_seo` at save time  
- **After** = `seo` written in that version  
- Changed fields are highlighted; unchanged fields are collapsed under a disclosure  

Restore is available from the compare panel and the table. The edit sheet only lists recent versions and links here for full compare.

## Code map

| Path | Role |
|------|------|
| `lib/seo/version-types.ts` | Constants + types + diff helpers |
| `lib/seo/versions.ts` | Audit DB record/list/stats/purge |
| `lib/seo/apply.ts` | Shared production SEO apply/load |
| `app/api/seo/versions/**` | HTTP surface |
| `components/seo/SeoVersionHistoryPanel.tsx` | Sheet history |
| `components/seo/SeoVersionsDashboard.tsx` | Dashboard |

## Future ideas (not in this release)

- Pin / favorite versions that survive the 30-day purge
- Side-by-side full JSON diff
- CSV export of history
- Notify Slack/email on restore
- Store parent coaching center id on branch versions for richer “Open” links
