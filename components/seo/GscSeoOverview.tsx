"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type GscOverview = {
  audit: { id: string; completed_at: string | null; score_total: number | null; gsc_status: string; gsc_error_count: number } | null;
  stats: Array<{ date_range: string; clicks: number; impressions: number; ctr: number | null; avg_position: number | null }>;
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number | null; position: number | null }>;
};

const number = (value: number | null | undefined, digits = 0) => value == null ? "—" : value.toFixed(digits);

export function GscSeoOverview({ entityType, entityId }: { entityType: "center" | "branch"; entityId: string }) {
  const [data, setData] = useState<GscOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
    fetch(`/api/audits/entity?${params.toString()}`).then(async (response) => { if (!response.ok) throw new Error("Could not load GSC overview"); return response.json(); }).then(setData).catch(() => setError(true));
  }, [entityType, entityId]);
  if (error) return <section className="branch-gsc-overview"><div className="card"><div className="branch-gsc-head"><div><h2>GSC overview</h2><p>Could not load the latest page search data.</p></div></div></div></section>;
  if (!data) return <section className="branch-gsc-overview"><div className="card"><div className="empty-state">Loading latest GSC overview…</div></div></section>;
  const stat = data.stats.find((item) => item.date_range === "28d") ?? data.stats[0];
  const status = data.audit?.gsc_status ?? "NOT RUN";
  return <section className="branch-gsc-overview"><div className="card"><div className="branch-gsc-head"><div><h2>GSC overview</h2><p>Latest Search Console signals for this {entityType} page.</p></div><span className={`gsc-status ${status.toLowerCase()}`}>{status}</span></div>{data.audit ? <><div className="branch-gsc-metrics"><div className="branch-gsc-metric"><span>Clicks · 28d</span><b>{number(stat?.clicks)}</b></div><div className="branch-gsc-metric"><span>Impressions · 28d</span><b>{number(stat?.impressions)}</b></div><div className="branch-gsc-metric"><span>CTR · 28d</span><b>{number(stat?.ctr == null ? null : stat.ctr * 100, 2)}%</b></div><div className="branch-gsc-metric"><span>Avg position</span><b>{number(stat?.avg_position, 1)}</b></div></div>{data.queries.length ? <div className="branch-gsc-query-list"><h3>Top queries of this page</h3>{data.queries.slice(0, 5).map((query) => <div className="branch-gsc-query" key={query.query}><span title={query.query}>{query.query}</span><small>{number(query.clicks)} clicks · {number(query.impressions)} imp · pos {number(query.position, 1)}</small></div>)}</div> : <div className="audit-unavailable">No search queries were recorded for this page in the last 28 days.</div>}<div className="branch-gsc-actions"><Link className="btn btn-ghost btn-sm" href={`/seo-audit?audit_id=${data.audit.id}`}>View full audit</Link></div></> : <div className="audit-unavailable">Run an SEO audit to capture this page’s Search Console results.</div>}</div></section>;
}