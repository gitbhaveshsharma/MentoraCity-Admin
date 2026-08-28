"use client";

import {
  buildSeoVersionCompare,
  type SeoVersionRow,
} from "@/lib/seo/versions";

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatWhen(value: string) {
  return dateTimeFmt.format(new Date(value));
}

export function SeoVersionCompare({
  version,
  onClose,
  onRestore,
  restoring,
}: {
  version: SeoVersionRow;
  onClose: () => void;
  onRestore: () => void;
  restoring?: boolean;
}) {
  const rows = buildSeoVersionCompare(
    version.previous_seo,
    version.seo,
    version.changed_fields,
  );
  const changedOnly = rows.filter((row) => row.changed);
  const unchanged = rows.filter((row) => !row.changed);

  return (
    <section className="card versions-compare-card" aria-label="Version compare">
      <div className="section-heading" style={{ margin: 0 }}>
        <div>
          <h2>
            Compare · v{version.version_number}
            {version.entity_name ? ` · ${version.entity_name}` : ""}
          </h2>
          <p className="section-sub">
            {formatWhen(version.created_at)} · {version.source}
            {version.change_summary ? ` · ${version.change_summary}` : ""}
          </p>
        </div>
        <div className="versions-compare-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={restoring}
            onClick={onRestore}
          >
            {restoring ? "Restoring…" : "Restore this version"}
          </button>
        </div>
      </div>

      {!version.previous_seo && (
        <p className="field-help" style={{ marginTop: 14 }}>
          No previous snapshot for this save — showing the values written in this
          version only.
        </p>
      )}

      <div className="versions-compare-grid" role="table" aria-label="Before and after">
        <div className="versions-compare-head" role="row">
          <span role="columnheader">Field</span>
          <span role="columnheader">Before</span>
          <span role="columnheader">After</span>
        </div>
        {changedOnly.length === 0 && (
          <div className="versions-compare-empty">
            No field-level differences recorded for this version.
          </div>
        )}
        {changedOnly.map((row) => (
          <div
            className="versions-compare-row changed"
            role="row"
            key={row.field}
          >
            <span role="cell">
              <b>{row.field}</b>
              <small className="badge badge-source">changed</small>
            </span>
            <pre role="cell" className="versions-compare-value before">
              {row.before}
            </pre>
            <pre role="cell" className="versions-compare-value after">
              {row.after}
            </pre>
          </div>
        ))}
      </div>

      {unchanged.length > 0 && (
        <details className="versions-compare-unchanged">
          <summary>
            {unchanged.length} unchanged field
            {unchanged.length === 1 ? "" : "s"}
          </summary>
          <div className="versions-compare-grid">
            {unchanged.map((row) => (
              <div className="versions-compare-row" role="row" key={row.field}>
                <span role="cell">
                  <b>{row.field}</b>
                </span>
                <pre role="cell" className="versions-compare-value">
                  {row.before}
                </pre>
                <pre role="cell" className="versions-compare-value">
                  {row.after}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
