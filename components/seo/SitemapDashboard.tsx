"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { PageSitemapPayload } from "@/lib/seo/pages/types";

const SITEMAP_CLIENT_CACHE_KEY = "pages-sitemap-v1";

export function SitemapDashboard() {
  const [data, setData] = useState<PageSitemapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editPath, setEditPath] = useState<string | null>(null);

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

  const urls = useMemo(() => {
    const list = data?.urls ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => row.path.includes(q) || row.page_url.includes(q));
  }, [data, query]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const paged = useMemo(
    () => paginateItems(urls, page, PAGE_SIZE),
    [urls, page],
  );

  return (
    <main className="content versions-page">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ marginTop: 9 }}>
            Sitemap
          </h1>
          <p className="page-sub">
            Browse GSC-submitted sitemaps and select a URL to edit path-based SEO
            overrides.
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
        </div>
        <div className="versions-toolbar">
          <input
            className="versions-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter URLs…"
            aria-label="Filter sitemap URLs"
          />
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
                  <TableHead>Page URL</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row) => (
                  <TableRow key={row.path}>
                    <TableCell>
                      <b>{row.path}</b>
                    </TableCell>
                    <TableCell>{row.page_url}</TableCell>
                    <TableCell>
                      <Badge variant={row.has_override ? "active" : "muted"}>
                        {row.has_override ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditPath(row.path)}
                      >
                        Edit SEO
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
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
    </main>
  );
}
