import { SeoPayload } from "@/lib/types";
import { seoHealth, seoScore } from "@/lib/utils/seoScore";

export function SeoHealthScore({ seo, compact = false }: { seo: SeoPayload; compact?: boolean }) {
  const score = seoScore(seo); const health = seoHealth(score); const angle = score * 3.6;
  const checks = [
    ["Custom title", seo.title.source === "custom", 20, "Add a 30–70 character custom title"],
    ["Custom description", seo.description.source === "custom", 20, "Add a 50–160 character custom description"],
    ["Canonical URL", Boolean(seo.canonical_url), 15, "Set the page canonical URL"],
    ["OG image", Boolean(seo.og.image && !seo.og.image.includes("default-coaching-og-image")), 15, "Upload a unique 1200×630 OG image"],
    ["Robots index", seo.robots.index, 15, "Enable index so search engines can crawl this page"],
    ["Schema.org", Boolean(seo.schema && Object.keys(seo.schema).length), 15, "Regenerate the EducationalOrganization schema"],
  ] as const;
  if (compact) return <span title={`${score}/100 · ${health.label}`}><span className={`health-dot ${score >= 70 ? "green" : score >= 50 ? "yellow" : "red"}`} />{health.label}</span>;
  return <div className="health-score-wrap"><div className="health-score"><div className="ring" style={{ background: `conic-gradient(${health.color} ${angle}deg, var(--color-border) ${angle}deg)` }}><span>{score}</span></div><div className="score-label">SEO health <small style={{ color: health.color }}>{health.label} · out of 100</small></div></div><div className="score-breakdown"><div className="score-breakdown-head"><strong>What is present and what is missing</strong><span>{score}/100</span></div>{checks.map(([label, present, points, next]) => <div className="score-check" key={label}><span className={`score-check-icon ${present ? "present" : "missing"}`}>{present ? "✓" : "×"}</span><span><b>{label}</b><small>{present ? `Present · +${points} points` : `Missing · next: ${next}`}</small></span><em>{present ? `+${points}` : `0/${points}`}</em></div>)}</div></div>;
}
