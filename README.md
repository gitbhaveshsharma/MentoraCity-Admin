# MentoraCity SEO Control Center

Next.js 15 App Router dashboard for admin-only coaching-center SEO management.

## Run locally

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open `/login` and use Supabase email OTP. The middleware requires `role = "A"` in `profiles.role` (with Auth metadata as a fallback) before allowing `/coachings/**`.

## Included workflow

- Responsive center table/cards with search, filters, SEO health score, and branch navigation.
- Center and branch detail pages with locked profile/address fields.
- Right-side SEO Sheet with generated/custom title and description controls, live counters, canonical URL, robots toggles, OG/Twitter fields, JSON-LD preview, and schema regeneration.
- Zod validation, optimistic SEO updates, rollback on API failure, and version bumping.
- Supabase-safe `metadata.seo` merge in update, bulk-update, and schema regeneration route handlers.
- Client-side OG image validator/uploader (`components/seo/OgImageUploader.tsx`) for JPG/PNG/WebP, 500KB limit, and 1200×630 recommendation.
- Normalized audit-log migration at `supabase/migrations/20260827000000_seo_audit_logs.sql` (13 tables, enums, indexes, and timestamp triggers).
- Audit runner at `POST /api/audits/run` and live dashboard at `/seo-audit` with score trend, issue counts, timeline, and run-audit control.
- Google Search Console integration uses `GSC_SITE_URL` and `GOOGLE_SERVICE_ACCOUNT_KEY`; `googleapis` handles service-account token creation and refresh automatically.

`npm run build` is the verification command; it currently passes with the declared dependencies.

## Audit database setup

The audit log database is intentionally separate from the production Supabase project. Apply the migration to that project with the Supabase CLI:

```bash
supabase link --project-ref <audit-project-ref>
supabase db push
```

Set `SEO_AUDIT_SUPABASE_URL` and `SEO_AUDIT_SUPABASE_SERVICE_ROLE_KEY` in the Next.js server environment. The service key is server-only and must never be exposed as a `NEXT_PUBLIC_*` variable. The production Supabase session still protects the dashboard and verifies the admin role before the audit service key is used.

For GSC, create a Google Cloud service account, grant its email access to the verified `GSC_SITE_URL` property, and set `GOOGLE_SERVICE_ACCOUNT_KEY` to the JSON credentials object. Without it, structural audits still complete and are marked as “without GSC” in the activity log; no fake metrics are written.

## Planned workspace features

### SEO Audit

The SEO Audit workspace will run the same checks used by the health score across every center and branch: custom title, custom description, canonical URL, unique OG image, robots indexability, and valid Schema.org JSON-LD. It will provide filterable issue queues, severity, the affected URL/entity, the current value, the recommended fix, the last checked time, and a direct link that opens the SEO Sheet. Audits should be cached by entity/version and rerun when `metadata.seo.version` changes or when a manual re-check is requested.

### Content Queue

The Content Queue will turn audit findings into assignable work for the SEO team. Each item will include the coaching center/branch, content type (title, description, OG image, schema, blog brief), recommendation, owner, status (`Backlog`, `In progress`, `Review`, `Published`), priority, due date, notes, and a change history. Queue items should link back to the affected SEO field and keep editorial workflow separate from locked coaching profile data.

### Blogs

Blogs is currently a “Coming soon” route. It will later manage keyword briefs, drafts, SEO review, scheduled publishing, and internal links to coaching and branch pages.
