"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  SEO_VERSION_RETENTION_DAYS,
  daysUntilExpiry,
  type SeoVersionEntityType,
  type SeoVersionRow,
} from "@/lib/seo/versions";
import type { SeoPayload } from "@/lib/types";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatWhen(value: string) {
  return dateTime.format(new Date(value));
}

function effectiveTitle(seo: SeoPayload) {
  return seo.title.source === "custom" && seo.title.custom
    ? seo.title.custom
    : seo.title.generated;
}

function effectiveDescription(seo: SeoPayload) {
  return seo.description.source === "custom" && seo.description.custom
    ? seo.description.custom
    : seo.description.generated;
}

export function SeoVersionHistoryPanel({
  entityId,
  entityType,
  open,
  onRestored,
}: {
  entityId: string;
  entityType: SeoVersionEntityType;
  open: boolean;
  onRestored: (seo: SeoPayload) => void;
}) {
  const [versions, setVersions] = useState<SeoVersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        entity_type: entityType,
        entity_id: entityId,
        limit: "20",
      });
      const response = await fetch(`/api/seo/versions?${params}`);
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => null))?.error ??
            "Could not load version history",
        );
      }
      const data = (await response.json()) as { versions: SeoVersionRow[] };
      setVersions(data.versions);
    } catch (error) {
      toast.error("Version history unavailable", {
        description: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const restore = async (version: SeoVersionRow) => {
    const confirmed = window.confirm(
      `Restore SEO to version ${version.version_number}? This creates a new version and does not delete history.`,
    );
    if (!confirmed) return;
    setRestoringId(version.id);
    try {
      const response = await fetch("/api/seo/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: version.id }),
      });
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => null))?.error ?? "Restore failed",
        );
      }
      const data = (await response.json()) as { seo: SeoPayload };
      onRestored(data.seo);
      toast.success("SEO restored", {
        description: `Version ${version.version_number} applied. A new snapshot was recorded.`,
      });
      await load();
    } catch (error) {
      toast.error("Restore failed", {
        description: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setRestoringId(null);
    }
  };

  const historyHref = `/seo-versions?entity_type=${entityType}&entity_id=${entityId}`;

  return (
    <div className="form-section seo-version-section">
      <h3>G · Version history</h3>
      <Alert className="seo-version-alert">
        <AlertTitle>History expires after {SEO_VERSION_RETENTION_DAYS} days</AlertTitle>
        <AlertDescription>
          Every SEO save creates a snapshot you can restore. Snapshots older than{" "}
          {SEO_VERSION_RETENTION_DAYS} days are deleted automatically.
        </AlertDescription>
      </Alert>

      {loading && <p className="field-help">Loading history…</p>}
      {!loading && versions.length === 0 && (
        <p className="field-help">No saved versions yet for this page.</p>
      )}

      {versions.length > 0 && (
        <div className="seo-version-table" role="table" aria-label="SEO version history">
          <div className="seo-version-head" role="row">
            <span role="columnheader">When</span>
            <span role="columnheader">Ver</span>
            <span role="columnheader">Changed</span>
            <span role="columnheader">Actions</span>
          </div>
          {versions.map((version) => {
            const previewOpen = previewId === version.id;
            const daysLeft = daysUntilExpiry(version.expires_at);
            return (
              <div key={version.id} className="seo-version-block">
                <div className="seo-version-row" role="row">
                  <span role="cell">
                    {formatWhen(version.created_at)}
                    <small className="seo-version-meta">
                      {version.source}
                      {daysLeft <= 7 ? ` · ${daysLeft}d left` : ""}
                    </small>
                  </span>
                  <span role="cell">v{version.version_number}</span>
                  <span role="cell" title={version.change_summary ?? undefined}>
                    {version.change_summary ?? "—"}
                  </span>
                  <span className="seo-version-actions" role="cell">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setPreviewId(previewOpen ? null : version.id)
                      }
                    >
                      {previewOpen ? "Hide" : "Preview"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={restoringId === version.id}
                      onClick={() => void restore(version)}
                    >
                      {restoringId === version.id ? "…" : "Restore"}
                    </button>
                  </span>
                </div>
                {previewOpen && (
                  <div className="seo-version-preview">
                    <p>
                      <b>Title</b> {effectiveTitle(version.seo)}
                    </p>
                    <p>
                      <b>Description</b> {effectiveDescription(version.seo)}
                    </p>
                    <p>
                      <b>Canonical</b> {version.seo.canonical_url}
                    </p>
                    <p>
                      <b>Robots</b> index={String(version.seo.robots.index)},
                      follow={String(version.seo.robots.follow)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link className="seo-version-link" href={historyHref}>
        Open full history dashboard →
      </Link>
    </div>
  );
}
