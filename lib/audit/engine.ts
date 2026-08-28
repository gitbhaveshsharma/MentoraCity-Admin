import type { SeoPayload } from "@/lib/types";

export type AuditIssue = { issue_code: string; severity: "CRITICAL" | "WARNING" | "INFO"; dimension: "technical" | "onpage" | "content" | "performance"; description: string; current_value: string | null; expected_value: string | null };
export type AuditResult = { total: number; grade: "EXCELLENT" | "GOOD" | "NEEDS_WORK" | "POOR"; issues: AuditIssue[]; scores: Array<{ dimension: string; score: number; max_score: number; grade: "EXCELLENT" | "GOOD" | "NEEDS_WORK" | "POOR" }> };
export type GscSignals = { averagePosition: number | null; ctr: number | null; impressions28d: number | null; clicksDeltaPercent: number | null; indexed: boolean | null; mobileUsable: boolean | null; richResultCount: number };
const grade = (score: number): AuditResult["grade"] => score >= 90 ? "EXCELLENT" : score >= 70 ? "GOOD" : score >= 50 ? "NEEDS_WORK" : "POOR";

export function auditSeo(seo: SeoPayload): AuditResult {
  const issues: AuditIssue[] = []; const checks = { title: seo.title.source === "custom", description: seo.description.source === "custom", canonical: Boolean(seo.canonical_url), og: Boolean(seo.og?.image && !seo.og.image.includes("default-coaching-og-image")), robots: seo.robots?.index === true, schema: Boolean(seo.schema && Object.keys(seo.schema).length) };
  if (!checks.title) issues.push({ issue_code: "TITLE_NOT_CUSTOM", severity: "WARNING", dimension: "onpage", description: "The page is using a generated title.", current_value: seo.title.generated, expected_value: "A valid custom title between 30 and 70 characters" });
  if (checks.title && ((seo.title.custom?.length ?? 0) < 30 || (seo.title.custom?.length ?? 0) > 70)) issues.push({ issue_code: "TITLE_LENGTH_INVALID", severity: "WARNING", dimension: "onpage", description: "The custom title is outside the recommended length.", current_value: seo.title.custom, expected_value: "30–70 characters" });
  if (!checks.description) issues.push({ issue_code: "DESCRIPTION_NOT_CUSTOM", severity: "WARNING", dimension: "onpage", description: "The page is using a generated meta description.", current_value: seo.description.generated, expected_value: "A valid custom description between 50 and 160 characters" });
  if (checks.description && ((seo.description.custom?.length ?? 0) < 50 || (seo.description.custom?.length ?? 0) > 160)) issues.push({ issue_code: "DESCRIPTION_LENGTH_INVALID", severity: "WARNING", dimension: "onpage", description: "The custom description is outside the recommended length.", current_value: seo.description.custom, expected_value: "50–160 characters" });
  if (!checks.canonical) issues.push({ issue_code: "MISSING_CANONICAL", severity: "CRITICAL", dimension: "technical", description: "No canonical URL is configured.", current_value: null, expected_value: "A canonical HTTPS page URL" });
  if (!checks.og) issues.push({ issue_code: "MISSING_OG_IMAGE", severity: "INFO", dimension: "content", description: "The page uses the default or missing Open Graph image.", current_value: seo.og?.image ?? null, expected_value: "A unique 1200×630 image under 500KB" });
  if (!checks.robots) issues.push({ issue_code: "ROBOTS_NO_INDEX", severity: "CRITICAL", dimension: "technical", description: "Search engines are instructed not to index this page.", current_value: String(seo.robots?.index), expected_value: "robots.index = true" });
  if (!checks.schema) issues.push({ issue_code: "MISSING_SCHEMA", severity: "WARNING", dimension: "technical", description: "No Schema.org JSON-LD object is present.", current_value: null, expected_value: "EducationalOrganization JSON-LD" });
  const total = (checks.title ? 20 : 0) + (checks.description ? 20 : 0) + (checks.canonical ? 15 : 0) + (checks.og ? 15 : 0) + (checks.robots ? 15 : 0) + (checks.schema ? 15 : 0);
  const dimensions = [{ dimension: "technical", score: Math.round(((checks.canonical ? 15 : 0) + (checks.robots ? 15 : 0) + (checks.schema ? 15 : 0)) / 45 * 100) }, { dimension: "onpage", score: Math.round(((checks.title ? 20 : 0) + (checks.description ? 20 : 0)) / 40 * 100) }, { dimension: "content", score: checks.og ? 100 : 0 }, { dimension: "performance", score: 100 }].map((item) => ({ ...item, max_score: 100, grade: grade(item.score) }));
  return { total, grade: grade(total), issues, scores: dimensions };
}

export function applyGscSignals(base: AuditResult, signals: GscSignals): AuditResult {
  const issues = [...base.issues]; let adjustment = 0; let visibilityScore = 100;
  const addSignal = (issue: AuditIssue, penalty: number) => { issues.push(issue); adjustment -= penalty; visibilityScore -= penalty; };
  if (signals.indexed === false) addSignal({ issue_code: "GSC_NOT_INDEXED", severity: "CRITICAL", dimension: "technical", description: "Google Search Console reports that this page is not indexed.", current_value: "NOT_INDEXED", expected_value: "INDEXED" }, 20);
  if (signals.mobileUsable === false) addSignal({ issue_code: "GSC_MOBILE_UNUSABLE", severity: "CRITICAL", dimension: "technical", description: "Google Search Console reports a mobile usability problem for this page.", current_value: "NOT_MOBILE_USABLE", expected_value: "MOBILE_USABLE" }, 15);
  if (signals.averagePosition !== null && signals.averagePosition > 30) addSignal({ issue_code: "GSC_LOW_AVERAGE_POSITION", severity: "WARNING", dimension: "performance", description: "The page has an average search position below the visibility threshold.", current_value: signals.averagePosition.toFixed(2), expected_value: "Average position at or above 30" }, 10);
  if (signals.ctr !== null && signals.averagePosition !== null && signals.impressions28d !== null && signals.impressions28d > 0) {
    const expectedCtr = signals.averagePosition <= 3 ? 0.1 : signals.averagePosition <= 10 ? 0.05 : signals.averagePosition <= 20 ? 0.025 : 0.01;
    if (signals.ctr < expectedCtr * 0.5) addSignal({ issue_code: "GSC_LOW_CTR", severity: "WARNING", dimension: "performance", description: "Click-through rate is low for the page's average search position.", current_value: `${(signals.ctr * 100).toFixed(2)}%`, expected_value: `At least ${(expectedCtr * 50).toFixed(2)}% for this position range` }, 5);
  }
  if (signals.impressions28d === 0) addSignal({ issue_code: "GSC_ZERO_IMPRESSIONS", severity: "WARNING", dimension: "performance", description: "The page received no impressions in the last 28 days.", current_value: "0", expected_value: "At least one search impression" }, 5);
  if (signals.clicksDeltaPercent !== null && signals.clicksDeltaPercent <= -20) addSignal({ issue_code: "GSC_CLICKS_DECLINING", severity: "WARNING", dimension: "performance", description: "Search clicks have declined materially compared with the previous audit.", current_value: `${signals.clicksDeltaPercent.toFixed(1)}%`, expected_value: "Clicks trend above -20%" }, 5);
  if (signals.richResultCount > 0) { adjustment += 2; visibilityScore = Math.min(100, visibilityScore + 2); }
  const score = Math.max(0, Math.min(100, base.total + adjustment));
  return { total: score, grade: grade(score), issues, scores: [...base.scores, { dimension: "search_visibility", score: Math.max(0, visibilityScore), max_score: 100, grade: grade(Math.max(0, visibilityScore)) }] };
}