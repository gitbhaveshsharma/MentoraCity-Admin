"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { UrlIndexStatus, UrlInspectionRecord } from "@/lib/seo/pages/types";

function statusVariant(status: UrlIndexStatus | undefined): "active" | "warning" | "muted" {
  if (status === "INDEXED") return "active";
  if (status === "NOT_INDEXED" || status === "EXCLUDED" || status === "ERROR") return "warning";
  return "muted";
}

function statusLabel(status: UrlIndexStatus | undefined) {
  if (status === "INDEXED") return "Indexed";
  if (status === "NOT_INDEXED") return "Not indexed";
  if (status === "EXCLUDED") return "Excluded";
  if (status === "ERROR") return "Error";
  return "Unknown";
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN");
}

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="inspect-score">
      <span>{label}</span>
      <b>{value == null ? "—" : value}</b>
    </div>
  );
}

export function UrlInspectSheet({
  open,
  pageUrl,
  initial,
  onClose,
  onUpdated,
}: {
  open: boolean;
  pageUrl: string;
  initial: UrlInspectionRecord | null;
  onClose: () => void;
  onUpdated: (inspection: UrlInspectionRecord) => void;
}) {
  const [inspection, setInspection] = useState<UrlInspectionRecord | null>(initial);
  const [running, setRunning] = useState(false);
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInspection(initial);
  }, [open, initial, pageUrl]);

  async function runInspect() {
    setRunning(true);
    try {
      const response = await fetch("/api/pages/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_url: pageUrl, live: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Inspect failed");
      setInspection(payload.inspection);
      onUpdated(payload.inspection);
      toast.success("Live inspection finished");
    } catch (error) {
      toast.error("Inspect failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setRunning(false);
    }
  }

  async function requestIndex() {
    setIndexing(true);
    try {
      const response = await fetch("/api/pages/index-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_url: pageUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Indexing request failed");
      setInspection(payload.inspection);
      onUpdated(payload.inspection);
      toast.success("Indexing requested");
    } catch (error) {
      toast.error("Could not request indexing", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setIndexing(false);
    }
  }

  if (!open) return null;

  const status = inspection?.index_status ?? "UNKNOWN";
  const canRequest = status !== "EXCLUDED";

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label="URL inspection">
        <header className="sheet-head">
          <div>
            <h2>URL inspection</h2>
            <p>{pageUrl}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="sheet-body">
          <div className="inspect-status-row">
            <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
            <span className="section-sub">
              Google index · {inspection?.coverage_state ?? "not inspected yet"}
            </span>
          </div>

          <div className="inspect-actions">
            <button type="button" className="btn btn-primary" disabled={running} onClick={() => void runInspect()}>
              {running ? "Running live test…" : "Live test"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={indexing || !canRequest}
              onClick={() => void requestIndex()}
            >
              {indexing ? "Submitting…" : "Request indexing"}
            </button>
          </div>
          {status === "EXCLUDED" && (
            <div className="warning">
              Google reports this URL as excluded (robots/noindex or similar). Fix that before requesting indexing.
            </div>
          )}
          {inspection?.index_requested_at && (
            <p className="section-sub" style={{ marginTop: 8 }}>
              Last index request {dateLabel(inspection.index_requested_at)}
              {inspection.index_request_error ? ` · ${inspection.index_request_error}` : ""}
            </p>
          )}

          {inspection?.gsc_error && <div className="warning">{inspection.gsc_error}</div>}
          {inspection?.live_error && <div className="warning">{inspection.live_error}</div>}

          <div className="form-section" style={{ marginTop: 22 }}>
            <h3>Google index</h3>
            <div className="detail-chip-grid">
              <span>
                <b>Coverage</b>
                {inspection?.coverage_state ?? "—"}
              </span>
              <span>
                <b>Last crawled</b>
                {dateLabel(inspection?.last_crawled_at)}
              </span>
              <span>
                <b>Canonical</b>
                {inspection?.canonical_google ?? "—"}
              </span>
              <span>
                <b>Crawl allowed</b>
                {inspection?.crawl_allowed == null ? "—" : inspection.crawl_allowed ? "Yes" : "No"}
              </span>
              <span>
                <b>Indexing allowed</b>
                {inspection?.indexing_allowed == null ? "—" : inspection.indexing_allowed ? "Yes" : "No"}
              </span>
              <span>
                <b>Fetch</b>
                {inspection?.page_fetch_state ?? "—"}
              </span>
            </div>
          </div>

          <div className="form-section">
            <h3>Live test</h3>
            <p className="section-sub">
              PageSpeed mobile run with screenshot and scores
              {inspection?.live_tested_at ? ` · ${dateLabel(inspection.live_tested_at)}` : ""}
            </p>
            <div className="inspect-score-row">
              <ScoreChip label="Performance" value={inspection?.performance_score ?? null} />
              <ScoreChip label="SEO" value={inspection?.seo_score ?? null} />
              <ScoreChip label="Accessibility" value={inspection?.accessibility_score ?? null} />
              <ScoreChip label="HTTP" value={inspection?.live_http_status ?? null} />
            </div>
            {inspection?.screenshot_data_url ? (
              <figure className="inspect-screenshot">
                <img src={inspection.screenshot_data_url} alt={`Live screenshot of ${pageUrl}`} />
                <figcaption>Google live screenshot</figcaption>
              </figure>
            ) : (
              <div className="empty-state" style={{ marginTop: 14 }}>
                {running
                  ? "Capturing live screenshot…"
                  : "Run a live test to capture screenshot and scores."}
              </div>
            )}
          </div>
        </div>
        <footer className="sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={running} onClick={() => void runInspect()}>
            {running ? "Testing…" : "Run live test"}
          </button>
        </footer>
      </section>
    </>
  );
}

export { statusLabel, statusVariant };
