# Blog CMS

Admin authors posts in this MentoraCity SEO dashboard. **mentoracity.com reads published posts** from the SEO audit Supabase project. This app does **not** serve public `/blog` pages.

## Architecture

| Layer | Role |
|---|---|
| Dashboard `/blogs` | Create, edit, publish (admin only) |
| Audit Supabase `blogs` | Source of truth for post body + SEO |
| Audit Storage `blog-media` | Cover / OG / inline image URLs |
| mentoracity.com | Public render of `status = 'published'` rows |

Env (already used elsewhere):

- `SEO_AUDIT_SUPABASE_URL`
- `SEO_AUDIT_SUPABASE_SERVICE_ROLE_KEY`

## Apply migration (audit project)

Run on the **audit** Supabase project (`sigdzacmgbqemvjshspi` / `SEO_AUDIT_SUPABASE_URL`):

```bash
# from repo root, linked to the audit project
supabase db push
```

Or paste [`supabase/migrations/20260906120000_blogs.sql`](../supabase/migrations/20260906120000_blogs.sql) into the SQL editor.

The migration creates:

- Table `blogs` with TipTap `content_html` / `content_json`, status, SEO fields
- RLS: anon/authenticated **select** where `status = 'published'`
- Public storage bucket `blog-media`

If `storage.buckets` insert fails in SQL, create bucket **blog-media** (public) in the Storage UI and allow public read.

## Admin APIs

All routes require production session + admin:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/blogs` | List (`status`, `search`, `page`, `page_size`) |
| POST | `/api/blogs` | Create draft |
| GET | `/api/blogs/[id]` | Editor payload |
| PUT | `/api/blogs/[id]` | Save body + SEO (HTML sanitized) |
| POST | `/api/blogs/[id]/publish` | Set `published` + `published_at` |
| POST | `/api/blogs/upload` | Multipart image → `blog-media` |

## TipTap HTML contract

Stored `content_html` is sanitized (allowlist: headings h2/h3, paragraphs, lists, links, images, blockquote, basic marks). Images may include `data-align` (`left` | `center` | `right`).

`content_json` is the TipTap document for round-trip editing.

## How mentoracity should read

Server-side (recommended) with the audit project URL + a read key:

```sql
select *
from blogs
where status = 'published'
  and slug = $1
limit 1;
```

List for sitemap / index:

```sql
select slug, title, excerpt, cover_image_url, og_image_url,
       meta_title, meta_description, published_at, updated_at
from blogs
where status = 'published'
order by published_at desc nulls last;
```

Head tags from:

- `meta_title` (fallback: `title`)
- `meta_description` (fallback: `excerpt`)
- `canonical_url`
- `og_image_url` (fallback: `cover_image_url`)
- `robots_index`

Render body with `content_html` (already sanitized on save).

Anon key works for published rows when RLS policy is applied. Prefer service/read key on mentoracity server anyway.

## Editor UX

- Sticky block toolbar: paragraph, H2/H3, lists, quote, image, undo/redo
- Selection **bubble menu**: bold, italic, underline, link, align L/C/R/J, image align when an image is selected
- Cover + OG upload via `/api/blogs/upload`
