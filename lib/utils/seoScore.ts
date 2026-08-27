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
  if (score >= 90) return { label: "Excellent", color: "#18a66b" };
  if (score >= 70) return { label: "Good", color: "#3b82f6" };
  if (score >= 50) return { label: "Needs work", color: "#d99016" };
  return { label: "Poor", color: "#e05252" };
}
