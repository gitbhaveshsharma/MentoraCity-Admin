"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageSeoSheet } from "@/components/seo/PageSeoSheet";
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
import type { PageOverviewRow } from "@/lib/seo/pages/types";

const PAGES_CLIENT_CACHE_KEY = "pages-overview-v1";
const CLIENT_TTL_MS = 5 * 60_000;

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(value: string | null) {
  return value ? dateFmt.format(new Date(value)) : "—";
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

export function PagesDashboard() {
  const searchParams = useSearchParams();
  const initialPath = searchParams.get("path");
  const [pages, setPages] = useState<PageOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editPath, setEditPath] = useState<string | null>(initialPath);

  const load = useCallback(async () => {
    const cached = readClientCache<{ pages: PageOverviewRow[] }>(
      PAGES_CLIENT_CACHE_KEY,
    );
    if (cached?.pages) {
      setPages(cached.pages);
      setLoading(false);
    }
    const response = await fetch("/api/pages");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not load pages");
    setPages(payload.pages ?? []);
    writeClientCache(
      PAGES_CLIENT_CACHE_KEY,
      { pages: payload.pages ?? [] },
      CLIENT_TTL_MS,
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((error) =>
        toast.error("Pages unavailable", {
          description: error instanceof Error ? error.message : "Try again",
        }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (initialPath) setEditPath(initialPath);
  }, [initialPath]);

  const sync = async () => {
    setSyncing(true);
    try {
      clearClientCache(PAGES_CLIENT_CACHE_KEY);
      const response = await fetch("/api/pages/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sync failed");
      setPages(payload.pages ?? []);
      writeClientCache(
        PAGES_CLIENT_CACHE_KEY,
        { pages: payload.pages ?? [] },
        CLIENT_TTL_MS,
      );
      toast.success("Sitemap synced", {
        description: `${payload.pages?.length ?? 0} pages refreshed from sitemap + GSC.`,
      });
    } catch (error) {
      toast.error("Sync failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setSyncing(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((pageRow) =>
      [pageRow.path, pageRow.title, pageRow.top_keywords.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [pages, query]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const paged = useMemo(
    () => paginateItems(visible, page, PAGE_SIZE),
    [visible, page],
  );
  const metrics = useMemo(() => {
    const withOverride = pages.filter((page) => page.has_override).length;
    const withImpressions = pages.filter((page) => (page.impressions ?? 0) > 0).length;
    const scored = pages.filter((page) => page.score_total != null);
    const avgScore = scored.length
      ? Math.round(
          scored.reduce((sum, page) => sum + (page.score_total ?? 0), 0) / scored.length,
        )
      : null;
    return { withOverride, withImpressions, avgScore, total: pages.length };
  }, [pages]);

  return (
    <main className="content versions-page">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ marginTop: 9 }}>
            Pages
          </h1>
          <p className="page-sub">
            Sitemap inventory with GSC impressions, crawl signals, and path-based SEO
            overrides.
          </p>
        </div>
        <div className="audit-controls">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void sync()}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync sitemap"}
          </button>
          <Link className="btn btn-primary" href="/sitemap">
            Open sitemap
          </Link>
        </div>
      </div>

      <section className="queue-metrics" aria-label="Pages summary">
        <Metric label="URLs" value={metrics.total} detail="Sitemap + overrides" />
        <Metric
          label="With override"
          value={metrics.withOverride}
          detail="Saved in coaching_seo_overrides"
        />
        <Metric
          label="With impressions"
          value={metrics.withImpressions}
          detail="GSC last 28 days"
        />
        <Metric
          label="Avg audit score"
          value={metrics.avgScore ?? "—"}
          detail="Completed page audits"
        />
      </section>

      <section className="card versions-table-card">
        <div className="versions-toolbar">
          <input
            className="versions-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by path, title, keyword…"
            aria-label="Filter pages"
          />
        </div>

        {loading ? (
          <div className="empty-state">Loading pages…</div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            No pages yet. Sync the sitemap or open Sitemap to pick a URL.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Impressions</TableHead>
                  <TableHead>Last crawl</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((pageRow) => (
                  <TableRow key={pageRow.path}>
                    <TableCell>
                      <b>{pageRow.path}</b>
                      {pageRow.title && (
                        <small className="seo-version-meta">{pageRow.title}</small>
                      )}
                    </TableCell>
                    <TableCell>
                      {pageRow.score_total != null ? (
                        <>
                          {pageRow.score_total}
                          {pageRow.score_grade ? (
                            <small className="seo-version-meta">
                              {pageRow.score_grade}
                            </small>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {pageRow.impressions != null ? pageRow.impressions : "—"}
                      {pageRow.clicks != null && (
                        <small className="seo-version-meta">
                          {pageRow.clicks} clicks
                        </small>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(pageRow.last_crawled_at)}</TableCell>
                    <TableCell title={pageRow.top_keywords.join(", ")}>
                      {pageRow.top_keywords.slice(0, 2).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {pageRow.has_override ? (
                        <Badge variant={pageRow.is_active ? "active" : "muted"}>
                          {pageRow.is_active ? "Override on" : "Override off"}
                        </Badge>
                      ) : (
                        <Badge variant="muted">No override</Badge>
                      )}
                      {!pageRow.in_sitemap && (
                        <Badge variant="warning" style={{ marginLeft: 6 }}>
                          Not in sitemap
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="versions-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditPath(pageRow.path)}
                        >
                          Edit SEO
                        </button>
                        <Link
                          className="btn btn-ghost btn-sm"
                          href={`/seo-audit?page_url=${encodeURIComponent(pageRow.page_url)}&page_name=${encodeURIComponent(pageRow.title || pageRow.path)}&run=1`}
                        >
                          Audit
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              total={visible.length}
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
    </main>
  );
}
