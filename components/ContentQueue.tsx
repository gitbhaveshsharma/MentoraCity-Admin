"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type QueueItem = { id: string; audit_id: string; entity_type: "center" | "branch" | "page"; entity_id: string; entity_name: string; issue_code: string; title: string; recommendation: string | null; priority: "CRITICAL" | "WARNING" | "INFO"; status: "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED"; updated_at: string };
type QueueStatus = QueueItem["status"];
const statuses: QueueStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"];
const statusLabels: Record<QueueStatus | "ALL", string> = { ALL: "All statuses", OPEN: "Open", IN_PROGRESS: "In progress", DONE: "Done", DISMISSED: "Dismissed" };
const priorityLabels: Record<QueueItem["priority"], string> = { CRITICAL: "Critical", WARNING: "Warning", INFO: "Info" };
const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (value: string) => dateFormatter.format(new Date(value));
const formatEntityType = (type: QueueItem["entity_type"]) => type === "center" ? "Coaching center" : type === "branch" ? "Branch" : "Other page";
const priorityClass = (priority: QueueItem["priority"]) => "queue-priority " + priority.toLowerCase();

function QueueMetric({ label, value, tone, detail }: { label: string; value: number; tone: string; detail: string }) {
  return <div className={"queue-metric " + tone}><div className="queue-metric-top"><span>{label}</span><span className="queue-metric-icon" aria-hidden="true">{tone === "queue-metric-open" ? "!" : tone === "queue-metric-progress" ? "↗" : tone === "queue-metric-done" ? "✓" : "•"}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

export function ContentQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueStatus | "ALL">("ALL");

  useEffect(() => {
    fetch("/api/content-queue").then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load content queue");
      setItems(payload.items);
    }).catch((error) => toast.error("Content queue unavailable", { description: error instanceof Error ? error.message : "Try again" })).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => filter === "ALL" ? items : items.filter((item) => item.status === filter), [filter, items]);
  const counts = useMemo(() => ({ total: items.length, open: items.filter((item) => item.status === "OPEN").length, progress: items.filter((item) => item.status === "IN_PROGRESS").length, done: items.filter((item) => item.status === "DONE").length }), [items]);

  async function updateStatus(id: string, status: QueueStatus) {
    const previous = items;
    setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    try {
      const response = await fetch("/api/content-queue", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Could not update item");
    } catch (error) {
      setItems(previous);
      toast.error("Could not update queue item", { description: error instanceof Error ? error.message : "Try again" });
    }
  }

  return <main className="content content-queue-page">
    <section className="queue-hero">
      <div>
        <span className="badge badge-source">SEO workflow</span>
        <h1 className="page-title" style={{ marginTop: 9 }}>Content queue</h1>
        <p className="page-sub">Turn real audit findings into focused, trackable SEO work.</p>
      </div>
      <div className="queue-hero-meta">
        <span className="queue-live-dot" />
        <span>Synced with SEO audits</span>
      </div>
    </section>

    <section className="queue-metrics" aria-label="Queue summary">
      <QueueMetric label="Total findings" value={counts.total} tone="queue-metric-total" detail="Across all audited pages" />
      <QueueMetric label="Open" value={counts.open} tone="queue-metric-open" detail="Ready to action" />
      <QueueMetric label="In progress" value={counts.progress} tone="queue-metric-progress" detail="Currently being worked" />
      <QueueMetric label="Completed" value={counts.done} tone="queue-metric-done" detail="Resolved findings" />
    </section>

    <section className="queue-workspace">
      <div className="queue-toolbar">
        <div>
          <h2>SEO findings</h2>
          <p>{visible.length} {visible.length === 1 ? "finding" : "findings"} shown</p>
        </div>
        <div className="queue-filter-control">
          <label htmlFor="queue-status-filter">Filter</label>
          <Select value={filter} onValueChange={(value) => setFilter(value as QueueStatus | "ALL")}>
            <SelectTrigger id="queue-status-filter" className="queue-select-trigger"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectLabel>Filter by status</SelectLabel><SelectItem value="ALL">{statusLabels.ALL}</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <div className="queue-empty"><span className="queue-loading-dot" /><p>Loading audit findings…</p></div> : !visible.length ? <div className="queue-empty"><span className="queue-empty-icon">✓</span><h3>No findings in this view</h3><p>Run an SEO audit or choose another status filter to see work here.</p></div> : <div className="queue-cards" aria-live="polite">{visible.map((item) => <article className="queue-card" key={item.id}>
        <div className="queue-card-main">
          <div className="queue-card-heading"><span className={priorityClass(item.priority)}>{priorityLabels[item.priority]}</span><span className="queue-issue-code">{item.issue_code}</span></div>
          <h3>{item.title}</h3>
          <p className="queue-recommendation">{item.recommendation ?? "Review this finding and decide the next SEO action."}</p>
          <div className="queue-card-meta"><span className="queue-target-dot" /> <span>{item.entity_name}</span><span className="queue-meta-separator">·</span><span>{formatEntityType(item.entity_type)}</span><span className="queue-meta-separator">·</span><span>Updated {formatDate(item.updated_at)}</span></div>
        </div>
        <div className="queue-card-actions">
          <label className="queue-status-label" htmlFor={"queue-item-status-" + item.id}>Status</label>
          <Select value={item.status} onValueChange={(value) => updateStatus(item.id, value as QueueStatus)}>
            <SelectTrigger id={"queue-item-status-" + item.id} className="queue-select-trigger queue-status-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectLabel>Update status</SelectLabel>{statuses.map((status) => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <Link className="btn btn-ghost btn-sm queue-audit-link" href={"/seo-audit?audit_id=" + item.audit_id}>View audit <span aria-hidden="true">↗</span></Link>
        </div>
      </article>)}</div>}
    </section>
  </main>;
}