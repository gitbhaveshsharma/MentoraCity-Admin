"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SeoVersionCompare } from "@/components/seo/SeoVersionCompare";
import {
  SEO_VERSION_RETENTION_DAYS,
  daysUntilExpiry,
  type SeoVersionDailyStat,
  type SeoVersionRow,
  type SeoVersionStats,
} from "@/lib/seo/versions";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDay(value: string) {
  return dateFmt.format(new Date(`${value}T00:00:00.000Z`));
}

function formatWhen(value: string) {
  return dateTimeFmt.format(new Date(value));
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="queue-metric">
      <div className="queue-metric-top">
        <span>{label}</span>
        <span className="queue-metric-icon" aria-hidden="true">
          •
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ActivityChart({
  daily,
  selectedDay,
  onSelect,
}: {
  daily: SeoVersionDailyStat[];
  selectedDay: string | null;
  onSelect: (day: string | null) => void;
}) {
  const max = Math.max(1, ...daily.map((d) => d.saves + d.restores));
  const visible = daily.slice(-14);

  return (
    <section className="card audit-history-card">
      <div className="section-heading" style={{ margin: 0 }}>
        <div>
          <h2>Change activity</h2>
          <p className="section-sub">
            Saves and restores per day. Click a bar to filter the table.
          </p>
        </div>
        <span className="badge badge-muted">Last {visible.length} days</span>
      </div>
      {visible.every((d) => d.saves + d.restores === 0) ? (
        <div className="empty-state">No SEO edits recorded in this window yet.</div>
      ) : (
        <div className="history-chart versions-activity-chart" aria-label="SEO change activity">
          <div className="history-axis" aria-hidden="true">
            <span>{max}</span>
            <span>{Math.round(max / 2)}</span>
            <span>0</span>
          </div>
          {visible.map((item) => {
            const total = item.saves + item.restores;
            const height = Math.max(total ? 8 : 2, Math.round((total / max) * 100));
            const selected = selectedDay === item.date;
            return (
              <button
                type="button"
                key={item.date}
                className={`history-bar-row ${selected ? "selected" : ""}`}
                onClick={() => onSelect(selected ? null : item.date)}
                aria-label={`${formatDay(item.date)}: ${item.saves} saves, ${item.restores} restores`}
              >
                <span className="history-track">
                  <span className="history-bar" style={{ height: `${height}%` }} />
                </span>
                <strong>{total || "·"}</strong>
                <span className="history-tooltip" role="tooltip">
                  <b>{formatDay(item.date)}</b>
                  <span>
                    {item.saves} saves · {item.restores} restores · {item.fields_changed}{" "}
                    fields
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selectedDay && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 12 }}
          onClick={() => onSelect(null)}
        >
          Clear day filter ({formatDay(selectedDay)})
        </button>
      )}
    </section>
  );
}

function FieldBreakdown({
  fields,
}: {
  fields: SeoVersionStats["field_breakdown"];
}) {
  const max = Math.max(1, ...fields.map((f) => f.count));
  return (
    <section className="card">
      <div className="section-heading" style={{ margin: 0 }}>
        <div>
          <h2>Fields changed most</h2>
          <p className="section-sub">Across the last {SEO_VERSION_RETENTION_DAYS} days.</p>
        </div>
      </div>
      {!fields.length ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          Field diffs appear after the first save.
        </div>
      ) : (
        <ul className="versions-field-list">
          {fields.map((item) => (
            <li key={item.field}>
              <div className="versions-field-label">
                <span>{item.field}</span>
                <b>{item.count}</b>
              </div>
              <div className="versions-field-track" aria-hidden="true">
                <span style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SeoVersionsDashboard() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("entity_type");
  const initialId = searchParams.get("entity_id");

  const [stats, setStats] = useState<SeoVersionStats | null>(null);
  const [versions, setVersions] = useState<SeoVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [entityFilter, setEntityFilter] = useState(
    initialType && initialId ? `${initialType}:${initialId}` : "ALL",
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/seo/versions/stats");
    if (!response.ok) {
      throw new Error(
        (await response.json().catch(() => null))?.error ?? "Could not load stats",
      );
    }
    setStats(await response.json());
  }, []);

  const loadVersions = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (selectedDay) params.set("day", selectedDay);
    if (sourceFilter !== "ALL") params.set("source", sourceFilter);
    if (entityFilter !== "ALL") {
      const [type, id] = entityFilter.split(":");
      if (type && id) {
        params.set("entity_type", type);
        params.set("entity_id", id);
      }
    }
    const response = await fetch(`/api/seo/versions?${params}`);
    if (!response.ok) {
      throw new Error(
        (await response.json().catch(() => null))?.error ?? "Could not load versions",
      );
    }
    const data = (await response.json()) as { versions: SeoVersionRow[] };
    setVersions(data.versions);
  }, [selectedDay, sourceFilter, entityFilter]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadVersions()])
      .catch((error) =>
        toast.error("SEO versions unavailable", {
          description: error instanceof Error ? error.message : "Try again",
        }),
      )
      .finally(() => setLoading(false));
  }, [loadStats, loadVersions]);

  const entityOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const version of versions) {
      const key = `${version.entity_type}:${version.entity_id}`;
      if (!map.has(key)) {
        map.set(key, version.entity_name ?? version.entity_id);
      }
    }
    if (initialType && initialId) {
      const key = `${initialType}:${initialId}`;
      if (!map.has(key)) map.set(key, initialId);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [versions, initialType, initialId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return versions;
    return versions.filter((version) => {
      const haystack = [
        version.entity_name,
        version.change_summary,
        version.source,
        String(version.version_number),
        version.entity_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [versions, query]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  const restore = async (version: SeoVersionRow) => {
    const confirmed = window.confirm(
      `Restore “${version.entity_name ?? version.entity_id}” to version ${version.version_number}? A new snapshot will be recorded.`,
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
      toast.success("SEO restored", {
        description: `Version ${version.version_number} applied.`,
      });
      setSelectedVersionId(null);
      await Promise.all([loadStats(), loadVersions()]);
    } catch (error) {
      toast.error("Restore failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <main className="content versions-page">
      <div className="page-head">
        <div>
          <span className="badge badge-source">SEO operations</span>
          <h1 className="page-title" style={{ marginTop: 9 }}>
            SEO versions
          </h1>
          <p className="page-sub">
            Browse, compare, and restore SEO metadata snapshots from the last{" "}
            {SEO_VERSION_RETENTION_DAYS} days.
          </p>
        </div>
      </div>

      <Alert className="seo-version-alert" style={{ marginTop: 18 }}>
        <AlertTitle>Automatic retention · {SEO_VERSION_RETENTION_DAYS} days</AlertTitle>
        <AlertDescription>
          Version history is deleted automatically after {SEO_VERSION_RETENTION_DAYS} days.
          Restoring an older snapshot writes it back to the live page and records a new
          version — history is never rewritten.
        </AlertDescription>
      </Alert>

      <section className="queue-metrics" aria-label="Version summary">
        <Metric
          label="Versions (window)"
          value={stats?.total_versions ?? "—"}
          detail={`Last ${SEO_VERSION_RETENTION_DAYS} days`}
        />
        <Metric
          label="This week"
          value={stats?.versions_this_week ?? "—"}
          detail="All saves + restores"
        />
        <Metric
          label="Restores this week"
          value={stats?.restores_this_week ?? "—"}
          detail="Pull-backs applied"
        />
        <Metric
          label="Entities touched"
          value={stats?.entities_touched ?? "—"}
          detail={`Avg ${stats?.avg_fields_changed ?? 0} fields / save`}
        />
      </section>

      <div className="versions-grid">
        <ActivityChart
          daily={stats?.daily ?? []}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
        />
        <FieldBreakdown fields={stats?.field_breakdown ?? []} />
      </div>

      {selectedVersion && (
        <SeoVersionCompare
          version={selectedVersion}
          restoring={restoringId === selectedVersion.id}
          onClose={() => setSelectedVersionId(null)}
          onRestore={() => void restore(selectedVersion)}
        />
      )}

      <section className="card versions-table-card">
        <div className="section-heading" style={{ margin: 0 }}>
          <div>
            <h2>Version history</h2>
            <p className="section-sub">
              {loading
                ? "Loading…"
                : `${visible.length} snapshot${visible.length === 1 ? "" : "s"} · click a row to compare before / after`}
            </p>
          </div>
        </div>

        <div className="versions-toolbar">
          <input
            className="versions-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search entity, fields, source…"
            aria-label="Search versions"
          />
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="versions-select">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Source</SelectLabel>
                <SelectItem value="ALL">All sources</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="bulk">Bulk</SelectItem>
                <SelectItem value="restore">Restore</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="versions-select">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Entity</SelectLabel>
                <SelectItem value="ALL">All entities</SelectItem>
                {entityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {!loading && visible.length === 0 ? (
          <div className="empty-state">No versions match these filters.</div>
        ) : (
          <div className="versions-table" role="table">
            <div className="versions-table-head" role="row">
              <span>When</span>
              <span>Entity</span>
              <span>Ver</span>
              <span>Changed</span>
              <span>Source</span>
              <span>Expires</span>
              <span />
            </div>
            {visible.map((version) => {
              const selected = selectedVersionId === version.id;
              return (
                <div
                  className={`versions-table-row ${selected ? "selected" : ""}`}
                  role="row"
                  key={version.id}
                  tabIndex={0}
                  onClick={() =>
                    setSelectedVersionId(selected ? null : version.id)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedVersionId(selected ? null : version.id);
                    }
                  }}
                  aria-selected={selected}
                >
                  <span>{formatWhen(version.created_at)}</span>
                  <span>
                    <b>{version.entity_name ?? "Untitled"}</b>
                    <small className="seo-version-meta">
                      {version.entity_type}
                    </small>
                  </span>
                  <span>v{version.version_number}</span>
                  <span title={version.change_summary ?? undefined}>
                    {version.change_summary ?? "—"}
                  </span>
                  <span>
                    <span className="badge badge-muted">{version.source}</span>
                  </span>
                  <span>{daysUntilExpiry(version.expires_at)}d</span>
                  <span
                    className="versions-row-actions"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setSelectedVersionId(selected ? null : version.id)
                      }
                    >
                      {selected ? "Hide" : "Compare"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={restoringId === version.id}
                      onClick={() => void restore(version)}
                    >
                      {restoringId === version.id ? "Restoring…" : "Restore"}
                    </button>
                    <Link
                      className="btn btn-ghost btn-sm"
                      href={
                        version.entity_type === "center"
                          ? `/coachings/${version.entity_id}`
                          : `/coachings`
                      }
                    >
                      Open
                    </Link>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
