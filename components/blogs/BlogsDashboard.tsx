"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  TablePagination,
  paginateItems,
} from "@/components/ui/table-pagination";
import type { BlogListItem, BlogStatus } from "@/lib/blogs/types";

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

function statusVariant(status: BlogStatus) {
  if (status === "published") return "active" as const;
  if (status === "review" || status === "scheduled") return "warning" as const;
  return "muted" as const;
}

export function BlogsDashboard() {
  const router = useRouter();
  const [blogs, setBlogs] = useState<BlogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BlogStatus | "all">("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (query.trim()) params.set("search", query.trim());
    params.set("page_size", "100");
    const response = await fetch(`/api/blogs?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Could not load blogs");
    setBlogs(payload.blogs ?? []);
  }, [query, statusFilter]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((error) =>
        toast.error("Blogs unavailable", {
          description: error instanceof Error ? error.message : "Try again",
        }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const visible = useMemo(() => blogs, [blogs]);
  const paged = useMemo(() => paginateItems(visible, page), [visible, page]);

  const published = blogs.filter((blog) => blog.status === "published").length;
  const drafts = blogs.filter((blog) => blog.status === "draft").length;
  const seoReady = blogs.filter((blog) => blog.seo_ready).length;

  async function createPost() {
    setCreating(true);
    try {
      const response = await fetch("/api/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled post" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not create post");
      toast.success("Draft created");
      router.push(`/blogs/${payload.blog.id}`);
    } catch (error) {
      toast.error("Create failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="content versions-page">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ marginTop: 9 }}>
            Blogs
          </h1>
          <p className="page-sub">
            Author and publish posts here. mentoracity.com reads published
            content from the audit database.
          </p>
        </div>
        <div className="audit-controls">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void createPost()}
            disabled={creating}
          >
            {creating ? "Creating…" : "New post"}
          </button>
        </div>
      </div>

      <section className="queue-metrics">
        <Metric label="Posts" value={loading ? "—" : blogs.length} detail="Loaded in list" />
        <Metric label="Published" value={loading ? "—" : published} detail="Live for mentoracity" />
        <Metric label="Drafts" value={loading ? "—" : drafts} detail="Not public yet" />
        <Metric
          label="SEO ready"
          value={loading ? "—" : seoReady}
          detail="Meta title + description filled"
        />
      </section>

      <section className="card versions-table-card">
        <div className="versions-toolbar">
          <input
            className="versions-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or slug…"
          />
          <select
            className="filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as BlogStatus | "all")
            }
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {loading ? (
          <div className="empty-state">Loading blogs…</div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            No posts yet. Create a draft to start writing.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SEO</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((blog) => (
                  <TableRow key={blog.id}>
                    <TableCell>
                      <b>{blog.title}</b>
                      <small className="seo-version-meta">/blog/{blog.slug}</small>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(blog.status)}>
                        {blog.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={blog.seo_ready ? "active" : "warning"}>
                        {blog.seo_ready ? "Ready" : "Needs SEO"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(blog.updated_at)}</TableCell>
                    <TableCell>{formatDate(blog.published_at)}</TableCell>
                    <TableCell>
                      <div className="versions-row-actions">
                        <Link
                          className="btn btn-ghost btn-sm"
                          href={`/blogs/${blog.id}`}
                        >
                          Edit
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
    </main>
  );
}
