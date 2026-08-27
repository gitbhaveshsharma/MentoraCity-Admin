export type SeoSource = "generated" | "custom";

export type SeoPayload = {
  title: { source: SeoSource; custom: string | null; generated: string };
  description: { source: SeoSource; custom: string | null; generated: string };
  canonical_url: string;
  robots: { index: boolean; follow: boolean };
  og: { title: string; description: string; image: string; url: string; type: "website"; locale: string };
  twitter: { card: "summary_large_image"; title: string; description: string; image: string };
  schema: Record<string, unknown>;
  version: number;
};

export type CoachingCenter = {
  id: string; name: string; slug: string; description: string; category: string; status: string; owner_id?: string | null;
  phone: string; email: string; website: string; is_verified: boolean; is_featured: boolean;
  subjects: string[]; target_audience: string[]; metadata: { seo: SeoPayload };
  updated_at: string;
  owner?: CoachingOwner | null;
};

export type CoachingOwner = { id?: string; full_name?: string | null; email?: string | null; avatar_url?: string | null };

export type CoachingBranch = {
  id: string; coaching_center_id: string; name: string; description: string; branch_slug: string;
  manager_id?: string; phone: string; email: string; is_main_branch: boolean; is_active: boolean;
  metadata: { seo: SeoPayload }; teaching_mode?: string;
  address?: { address_line_1?: string; address_line_2?: string; city?: string; state?: string; pin_code?: string; latitude?: number; longitude?: number; google_place_id?: string; postal_address?: string } | null;
  manager?: CoachingOwner | null;
};

export const DEFAULT_OG = "https://mentoracity.com/default-coaching-og-image.jpg";

export function normalizeSeo(metadata: any, name: string, canonical: string): SeoPayload {
  const fallback = sampleSeo(name, canonical);
  const current = metadata?.seo ?? {};
  const title = { ...fallback.title, ...(current.title ?? {}) };
  const description = { ...fallback.description, ...(current.description ?? {}) };
  // A real custom value always wins, even when older records still say generated.
  if (typeof title.custom === "string" && title.custom.trim()) title.source = "custom";
  if (typeof description.custom === "string" && description.custom.trim()) description.source = "custom";
  return {
    ...fallback, ...current,
    title, description,
    robots: { ...fallback.robots, ...(current.robots ?? {}) },
    og: { ...fallback.og, ...(current.og ?? {}) },
    twitter: { ...fallback.twitter, ...(current.twitter ?? {}) },
    schema: current.schema ?? fallback.schema,
  };
}

export function normalizeCenter(row: any): CoachingCenter {
  return { ...row, category: row.category ?? "UNCATEGORIZED", status: row.status ?? "DRAFT", phone: row.phone ?? "", email: row.email ?? "", website: row.website ?? "", subjects: row.subjects ?? [], target_audience: row.target_audience ?? [], metadata: { ...(row.metadata ?? {}), seo: normalizeSeo(row.metadata, row.name ?? "Coaching center", `https://mentoracity.com/coaching/${row.slug ?? row.id}`) } };
}

export function normalizeBranch(row: any): CoachingBranch {
  return { ...row, phone: row.phone ?? "", email: row.email ?? "", branch_slug: row.branch_slug ?? row.slug ?? row.id, metadata: { ...(row.metadata ?? {}), seo: normalizeSeo(row.metadata, row.name ?? "Branch", `https://mentoracity.com/branch/${row.branch_slug ?? row.id}`) } };
}

export const sampleSeo = (name: string, canonical: string): SeoPayload => ({
  title: { source: "generated", custom: null, generated: `${name} — UPSC Civil Services | MentoraCity` },
  description: { source: "generated", custom: null, generated: `${name} is a competitive exam preparation institute offering structured classes, test series, study material, mentorship and doubt-clearing support.` },
  canonical_url: canonical,
  robots: { index: true, follow: true },
  og: { title: `${name} | MentoraCity`, description: `${name} coaching, courses and learning resources.`, image: DEFAULT_OG, url: canonical, type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: `${name} | MentoraCity`, description: `${name} coaching, courses and learning resources.`, image: DEFAULT_OG },
  schema: { "@context": "https://schema.org", "@type": "EducationalOrganization", name, url: canonical },
  version: 1,
});
