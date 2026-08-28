import { DEFAULT_OG, SeoPayload } from "@/lib/types";

export function seoScore(seo: SeoPayload) {
  let score = 0;
  if (seo.title.source === "custom") score += 20;
  if (seo.description.source === "custom") score += 20;
  if (seo.canonical_url) score += 15;
  if (seo.og.image && seo.og.image !== DEFAULT_OG) score += 15;
  if (seo.robots.index) score += 15;
  if (seo.schema && Object.keys(seo.schema).length > 0) score += 15;
  return score;
}

export function seoHealth(score: number) {
  if (score >= 90) return { label: "Excellent", color: "var(--color-success)" };
  if (score >= 70) return { label: "Good", color: "var(--color-brand-secondary)" };
  if (score >= 50) return { label: "Needs work", color: "var(--color-warning)" };
  return { label: "Poor", color: "var(--color-error)" };
}
