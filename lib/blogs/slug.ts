/** Lowercase kebab slug for mentoracity /blog/{slug}. */
export function slugifyTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizeSlug(slug: string): string {
  return slugifyTitle(slug);
}
