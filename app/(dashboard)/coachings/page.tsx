"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeCenter, type CoachingCenter } from "@/lib/types";
import { readClientCache, writeClientCache } from "@/lib/clientCache";
import { SeoHealthScore } from "@/components/seo/SeoHealthScore";
import { toast } from "sonner";

export default function CoachingsPage() {
  const [centers, setCenters] = useState<CoachingCenter[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [verified, setVerified] = useState("ALL");
  const [featured, setFeatured] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = readClientCache<CoachingCenter[]>("centers");
      if (cached) {
        setCenters(cached);
        setLoading(false);
        return;
      }
      const client = createClient();
      const { data, error: fetchError } = await client
        .from("coaching_centers")
        .select("*")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (fetchError) setError(fetchError.message);
      else {
        const normalized = (data ?? []).map(normalizeCenter);
        const ownerIds = normalized
          .map((row) => row.owner_id)
          .filter((id): id is string => Boolean(id));
        const { data: owners } = ownerIds.length
          ? await client
              .from("profiles")
              .select("id,full_name,email,avatar_url")
              .in("id", ownerIds)
          : { data: [] };
        const ownerMap = new Map(
          (owners ?? []).map((owner) => [owner.id, owner]),
        );
        normalized.forEach((row) => {
          row.owner = row.owner_id
            ? (ownerMap.get(row.owner_id) ?? null)
            : null;
        });
        setCenters(normalized);
        writeClientCache("centers", normalized);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const rows = useMemo(
    () =>
      centers
        .filter((row) => String(row.status).toUpperCase() !== "DRAFT")
        .filter((row) =>
          `${row.name} ${row.slug}`.toLowerCase().includes(query.toLowerCase()),
        )
        .filter((row) => status === "ALL" || row.status === status)
        .filter(
          (row) => verified === "ALL" || String(row.is_verified) === verified,
        )
        .filter(
          (row) => featured === "ALL" || String(row.is_featured) === featured,
        ),
    [centers, query, status, verified, featured],
  );
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Coaching centers</h1>
          <p className="page-sub">
            Manage discoverability and on-page SEO across your network.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() =>
            toast.info("Create flow coming soon", {
              description: "Centers are created in the main MentoraCity admin.",
            })
          }
        >
          ＋ Add coaching center
        </button>
      </div>
      <div className="toolbar">
        <div className="search">
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            placeholder="Search by name or slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          className="filter"
          value={verified}
          onChange={(e) => setVerified(e.target.value)}
        >
          <option value="ALL">Verification</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
        <select
          className="filter"
          value={featured}
          onChange={(e) => setFeatured(e.target.value)}
        >
          <option value="ALL">Featured</option>
          <option value="true">Featured</option>
          <option value="false">Not featured</option>
        </select>
      </div>
      {loading ? (
        <div className="empty-state">Loading all coaching centers…</div>
      ) : error ? (
        <div className="empty-state error-state">
          Could not load coaching centers: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          No coaching centers match these filters.
        </div>
      ) : (
        <>
          <div className="table-card coaching-table-card">
            <table className="coaching-table">
              <thead>
                <tr>
                  <th>Center</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>SEO health</th>
                  <th>Title / description</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        href={`/coachings/${row.id}`}
                        className="name-cell"
                        style={{ textDecoration: "none" }}
                      >
                        {row.name}
                        <small>/{row.slug}</small>
                      </Link>
                    </td>
                    <td>{row.owner?.full_name || row.owner?.email || "—"}</td>
                    <td>
                      <span className="badge badge-active">{row.status}</span>
                    </td>
                    <td>
                      <span className="badge badge-category">
                        {row.category}
                      </span>
                    </td>
                    <td>
                      <SeoHealthScore seo={row.metadata.seo} compact />
                    </td>
                    <td>
                      <span className="badge badge-source">
                        {row.metadata.seo.title.source}
                      </span>{" "}
                      <span className="badge badge-muted">
                        {row.metadata.seo.description.source}
                      </span>
                    </td>
                    <td>
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>
                      <Link
                        href={`/coachings/${row.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-cards coaching-mobile-cards">
            {rows.map((row) => (
              <div className="mobile-card" key={row.id}>
                <div className="mobile-card-top">
                  <Link
                    href={`/coachings/${row.id}`}
                    className="name-cell"
                    style={{ textDecoration: "none" }}
                  >
                    {row.name}
                    <small>/{row.slug}</small>
                  </Link>
                  <SeoHealthScore seo={row.metadata.seo} compact />
                </div>
                <div className="mobile-card-meta">
                  <span>
                    Owner
                    <br />
                    <b>{row.owner?.full_name || row.owner?.email || "—"}</b>
                  </span>
                  <span>
                    Status
                    <br />
                    <b className="badge badge-active" style={{ marginTop: 5 }}>
                      {row.status}
                    </b>
                  </span>
                  <span>
                    Category
                    <br />
                    <b
                      className="badge badge-category"
                      style={{ marginTop: 5 }}
                    >
                      {row.category}
                    </b>
                  </span>
                  <span>
                    Title / description
                    <br />
                    <b>
                      {row.metadata.seo.title.source} /{" "}
                      {row.metadata.seo.description.source}
                    </b>
                  </span>
                </div>
                <Link
                  href={`/coachings/${row.id}`}
                  className="btn btn-ghost"
                  style={{ display: "block", textAlign: "center" }}
                >
                  Open center
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="table-footer">
        <span>
          Showing {rows.length} center{rows.length === 1 ? "" : "s"}
        </span>
        <span>All records · sorted by latest update</span>
      </div>
    </main>
  );
}
