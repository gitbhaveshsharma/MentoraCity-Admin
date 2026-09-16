"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageSeoSheet } from "@/components/seo/PageSeoSheet";
import {
  UrlInspectSheet,
  statusLabel,
  statusVariant,
} from "@/components/seo/UrlInspectSheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PAGE_SIZE,
  TablePagination,
  paginateItems,
} from "@/components/ui/table-pagination";
import {
  clearClientCache,
  readClientCache,
  writeClientCache,
} from "@/lib/clientCache";
import type {
  PageSitemapPayload,
  SitemapUrlRow,
  UrlIndexStatus,
  UrlInspectionRecord,
} from "@/lib/seo/pages/types";

const SITEMAP_CLIENT_CACHE_KEY = "pages-sitemap-v2";

type StatusFilter = "ALL" | UrlIndexStatus;

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="card audit-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function SitemapDashboard() {
  const [data, setData] = useState<PageSitemapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [editPath, setEditPath] = useState<string | null>(null);
  const [inspectRow, setInspectRow] = useState<SitemapUrlRow | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = readClientCache<PageSitemapPayload>(SITEMAP_CLIENT_CACHE_KEY);
      if (cached) {
        setData(cached);
        setLoading(false);
      }
    }
    const response = await fetch(
      force ? "/api/pages/sitemap?refresh=1" : "/api/pages/sitemap",
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load sitemap");
    setData(payload);
    writeClientCache(SITEMAP_CLIENT_CACHE_KEY, payload, 5 * 60_000);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((error) =>
        toast.error("Sitemap unavailable", {
          description: error instanceof Error ? error.message : "Try again",
        }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const counts = useMemo(() => {
    const list = data?.urls ?? [];
    const tally = {
      total: list.length,
      indexed: 0,
      notIndexed: 0,
      unknown: 0,
    };
    for (const row of list) {
      const status = row.inspection?.index_status ?? "UNKNOWN";
      if (status === "INDEXED") tally.indexed += 1;
      else if (status === "UNKNOWN") tally.unknown += 1;
      else tally.notIndexed += 1;
    }
    return tally;
  }, [data]);

  const urls = useMemo(() => {
    const list = data?.urls ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((row) => {
      const status = row.inspection?.index_status ?? "UNKNOWN";
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!q) return true;
      return row.path.includes(q) || row.page_url.toLowerCase().includes(q);
    });
  }, [data, query, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const paged = useMemo(
    () => paginateItems(urls, page, PAGE_SIZE),
    [urls, page],
  );

  function patchInspection(pageUrl: string, inspection: UrlInspectionRecord) {
    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        urls: current.urls.map((row) =>
          row.page_url === pageUrl ? { ...row, inspection } : row,
        ),
      };
      writeClientCache(SITEMAP_CLIENT_CACHE_KEY, next, 5 * 60_000);
      return next;
    });
    setInspectRow((current) =>
      current?.page_url === pageUrl ? { ...current, inspection } : current,
    );
  }

  async function checkVisible() {
    if (!paged.length) return;
    setChecking(true);
    try {
      const response = await fetch("/api/pages/inspect/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page_urls: paged.map((row) => row.page_url) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Index check failed");
      const inspections = (payload.inspections ?? []) as UrlInspectionRecord[];
      for (const inspection of inspections) {
        patchInspection(inspection.page_url, inspection);
      }
      const errorCount = (payload.errors ?? []).length;
      toast.success("Index status updated", {
        description: `${inspections.length} URL${inspections.length === 1 ? "" : "s"} checked${errorCount ? `, ${errorCount} failed` : ""}.`,
      });
    } catch (error) {
      toast.error("Index check failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="content versions-page">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ marginTop: 9 }}>
            Sitemap
          </h1>
          <p className="page-sub">
            See which sitemap URLs Google has indexed, run a live test, then request indexing.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setLoading(true);
            clearClientCache(SITEMAP_CLIENT_CACHE_KEY);
            load(true)
              .catch((error) =>
                toast.error("Refresh failed", {
                  description:
                    error instanceof Error ? error.message : "Try again",
                }),
              )
              .finally(() => setLoading(false));
          }}
        >
          Refresh
        </button>
      </div>

      <div className="audit-stat-grid">
        <Metric label="URLs" value={counts.total} detail="From sitemap" />
        <Metric label="Indexed" value={counts.indexed} detail="Google index" />
        <Metric label="Not indexed" value={counts.notIndexed} detail="Missing or excluded" />
        <Metric label="Unknown" value={counts.unknown} detail="Not inspected yet" />
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="section-heading" style={{ margin: 0 }}>
          <div>
            <h2>Submitted sitemaps</h2>
            <p className="section-sub">
              From Google Search Console{data?.origin ? ` · ${data.origin}` : ""}
            </p>
          </div>
          <Badge variant="muted">{data?.sitemaps.length ?? 0}</Badge>
        </div>
        {!loading && !(data?.sitemaps.length) ? (
          <div className="empty-state" style={{ marginTop: 16 }}>
            No GSC sitemaps listed. Site XML candidates are still parsed when available.
          </div>
        ) : (
          <div className="versions-table" style={{ marginTop: 14 }}>
            {(data?.sitemaps ?? []).map((item) => (
              <div className="versions-table-row" key={item.path}>
                <span style={{ gridColumn: "1 / 4" }}>
                  <b>{item.path}</b>
                  <small className="seo-version-meta">
                    {item.isSitemapsIndex ? "Index" : "Sitemap"}
                    {item.isPending ? " · pending" : ""}
                    {item.errors ? ` · errors: ${item.errors}` : ""}
                  </small>
                </span>
                <span>
                  {item.lastSubmitted
                    ? new Date(item.lastSubmitted).toLocaleString("en-IN")
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card versions-table-card">
        <div className="section-heading" style={{ margin: 0 }}>
          <div>
            <h2>URL inventory</h2>
            <p className="section-sub">
              {loading
                ? "Loading…"
                : `${urls.length} URL${urls.length === 1 ? "" : "s"} · 20 per page`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={checking || loading || paged.length === 0}
            onClick={() => void checkVisible()}
          >
            {checking ? "Checking…" : "Check this page"}
          </button>
        </div>
        <div className="versions-toolbar">
          <input
            className="versions-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter URLs…"
            aria-label="Filter sitemap URLs"
          />
          <select
            className="filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            aria-label="Filter by index status"
          >
            <option value="ALL">All statuses</option>
            <option value="INDEXED">Indexed</option>
            <option value="NOT_INDEXED">Not indexed</option>
            <option value="EXCLUDED">Excluded</option>
            <option value="UNKNOWN">Unknown</option>
            <option value="ERROR">Error</option>
          </select>
        </div>
        {loading ? (
          <div className="empty-state">Loading sitemap URLs…</div>
        ) : urls.length === 0 ? (
          <div className="empty-state">No sitemap URLs found.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                  <TableHead>Index</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row) => {
                  const status = row.inspection?.index_status ?? "UNKNOWN";
                  return (
                    <TableRow key={row.path}>
                      <TableCell>
                        <b>{row.path}</b>
                        <small className="seo-version-meta">{row.page_url}</small>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.has_override ? "active" : "muted"}>
                          {row.has_override ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="inspect-row-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setInspectRow(row)}
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditPath(row.path)}
                          >
                            Edit SEO
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              total={urls.length}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      {editPath && (
        <PageSeoSheet
          open={Boolean(editPath)}
          path={editPath}
          onClose={() => setEditPath(null)}
          onSaved={() => {
            void load().catch(() => undefined);
          }}
        />
      )}

      {inspectRow && (
        <UrlInspectSheet
          open={Boolean(inspectRow)}
          pageUrl={inspectRow.page_url}
          initial={inspectRow.inspection}
          onClose={() => setInspectRow(null)}
          onUpdated={(inspection) => patchInspection(inspectRow.page_url, inspection)}
        />
      )}
    </main>
  );
}
