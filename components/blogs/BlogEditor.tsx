"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BlogImageUpload } from "@/components/blogs/BlogImageUpload";
import { BlogRichEditor } from "@/components/blogs/BlogRichEditor";
import { Badge } from "@/components/ui/badge";
import { slugifyTitle } from "@/lib/blogs/slug";
import type { BlogRecord, BlogStatus } from "@/lib/blogs/types";

const STATUS_OPTIONS: BlogStatus[] = [
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
];

function Counter({ value, max }: { value: string; max: number }) {
  const length = value.length;
  const invalid = length > max || (max >= 50 && length > 0 && length < Math.min(30, max));
  return (
    <small className={`counter ${length > max ? "invalid" : ""}`}>
      {length}/{max}
      {invalid && length > 0 && length < 30 && max === 70 ? " · aim 30–70" : ""}
      {invalid && length > 0 && length < 50 && max === 160 ? " · aim 50–160" : ""}
    </small>
  );
}

export function BlogEditor({ blogId }: { blogId: string }) {
  const router = useRouter();
  const [blog, setBlog] = useState<BlogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [status, setStatus] = useState<BlogStatus>("draft");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [robotsIndex, setRobotsIndex] = useState(true);
  const [authorName, setAuthorName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [relatedPathsInput, setRelatedPathsInput] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [contentJson, setContentJson] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const response = await fetch(`/api/blogs/${blogId}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error ?? "Could not load blog");
    const next = payload.blog as BlogRecord;
    setBlog(next);
    setTitle(next.title);
    setSlug(next.slug);
    setExcerpt(next.excerpt ?? "");
    setStatus(next.status);
    setMetaTitle(next.meta_title ?? "");
    setMetaDescription(next.meta_description ?? "");
    setCanonicalUrl(next.canonical_url ?? "");
    setOgImageUrl(next.og_image_url ?? "");
    setCoverImageUrl(next.cover_image_url ?? "");
    setRobotsIndex(next.robots_index);
    setAuthorName(next.author_name ?? "");
    setTagsInput((next.tags ?? []).join(", "));
    setRelatedPathsInput((next.related_paths ?? []).join(", "));
    setContentHtml(next.content_html);
    setContentJson(next.content_json ?? {});
  }, [blogId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((error) =>
        toast.error("Blog unavailable", {
          description: error instanceof Error ? error.message : "Try again",
        }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagsInput],
  );
  const relatedPaths = useMemo(
    () =>
      relatedPathsInput
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean),
    [relatedPathsInput],
  );

  async function save(nextStatus?: BlogStatus) {
    setSaving(true);
    try {
      const response = await fetch(`/api/blogs/${blogId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          excerpt,
          content_html: contentHtml,
          content_json: contentJson,
          status: nextStatus ?? status,
          meta_title: metaTitle,
          meta_description: metaDescription,
          canonical_url: canonicalUrl,
          og_image_url: ogImageUrl,
          robots_index: robotsIndex,
          author_name: authorName,
          cover_image_url: coverImageUrl,
          tags,
          related_paths: relatedPaths,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Save failed");
      setBlog(payload.blog);
      setStatus(payload.blog.status);
      toast.success("Blog saved");
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await save(status === "published" ? "published" : status);
      const response = await fetch(`/api/blogs/${blogId}/publish`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Publish failed");
      setBlog(payload.blog);
      setStatus(payload.blog.status);
      toast.success("Published", {
        description: "mentoracity.com can now read this post by slug.",
      });
    } catch (error) {
      toast.error("Publish failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setPublishing(false);
    }
  }

  if (loading || !blog) {
    return (
      <main className="content">
        <div className="empty-state">Loading blog editor…</div>
      </main>
    );
  }

  return (
    <main className="content blog-editor-page">
      <div className="page-head">
        <div>
          <Link className="btn btn-ghost btn-sm" href="/blogs">
            ← Blogs
          </Link>
          <h1 className="page-title" style={{ marginTop: 9 }}>
            Edit post
          </h1>
          <p className="page-sub">
            Content is stored for mentoracity.com · /blog/{slug || "…"}
          </p>
        </div>
        <div className="audit-controls">
          <Badge variant={status === "published" ? "active" : "muted"}>
            {status}
          </Badge>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void save()}
            disabled={saving || publishing}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void publish()}
            disabled={saving || publishing}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <div className="blog-editor-layout">
        <section className="card blog-editor-main">
          <div className="field">
            <label htmlFor="blog-title">Title</label>
            <input
              id="blog-title"
              className="filter"
              value={title}
              onChange={(event) => {
                const next = event.target.value;
                setTitle(next);
                if (!slugTouched) setSlug(slugifyTitle(next));
              }}
              placeholder="Post title"
            />
          </div>
          <div className="field">
            <label htmlFor="blog-slug">Slug</label>
            <input
              id="blog-slug"
              className="filter"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugifyTitle(event.target.value));
              }}
              placeholder="url-slug"
            />
            <small className="field-help">
              Public path on mentoracity: /blog/{slug || "slug"}
            </small>
          </div>
          <div className="field">
            <label>Body</label>
            <BlogRichEditor
              blogId={blogId}
              initialJson={contentJson}
              initialHtml={contentHtml}
              onChange={({ html, json }) => {
                setContentHtml(html);
                setContentJson(json);
              }}
            />
          </div>
        </section>

        <aside className="card blog-editor-side">
          <div className="form-section">
            <h3>Publishing</h3>
            <div className="field">
              <label htmlFor="blog-status">Status</label>
              <select
                id="blog-status"
                className="filter"
                value={status}
                onChange={(event) => setStatus(event.target.value as BlogStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="blog-author">Author</label>
              <input
                id="blog-author"
                className="filter"
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder="Author name"
              />
            </div>
            <div className="field">
              <label htmlFor="blog-tags">Tags</label>
              <input
                id="blog-tags"
                className="filter"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="neet, exam-tips"
              />
              <small className="field-help">Comma-separated</small>
            </div>
            <div className="field">
              <label htmlFor="blog-related">Related paths</label>
              <input
                id="blog-related"
                className="filter"
                value={relatedPathsInput}
                onChange={(event) => setRelatedPathsInput(event.target.value)}
                placeholder="/coaching/bihar/patna"
              />
              <small className="field-help">
                Internal links for mentoracity (comma-separated paths)
              </small>
            </div>
          </div>

          <div className="form-section">
            <h3>SEO</h3>
            <div className="field">
              <label htmlFor="blog-meta-title">Meta title</label>
              <input
                id="blog-meta-title"
                className="filter"
                value={metaTitle}
                onChange={(event) => setMetaTitle(event.target.value)}
                placeholder={title || "Meta title"}
              />
              <Counter value={metaTitle || title} max={70} />
            </div>
            <div className="field">
              <label htmlFor="blog-meta-desc">Meta description</label>
              <textarea
                id="blog-meta-desc"
                className="filter"
                rows={3}
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                placeholder="Search snippet for mentoracity"
              />
              <Counter value={metaDescription} max={160} />
            </div>
            <div className="field">
              <label htmlFor="blog-excerpt">Excerpt</label>
              <textarea
                id="blog-excerpt"
                className="filter"
                rows={3}
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                placeholder="Card / listing summary"
              />
            </div>
            <div className="field">
              <label htmlFor="blog-canonical">Canonical URL</label>
              <input
                id="blog-canonical"
                className="filter"
                value={canonicalUrl}
                onChange={(event) => setCanonicalUrl(event.target.value)}
                placeholder="https://mentoracity.com/blog/…"
              />
            </div>
            <div className="info-row">
              <span>Index in search</span>
              <button
                type="button"
                className={`toggle ${robotsIndex ? "on" : ""}`}
                onClick={() => setRobotsIndex((value) => !value)}
                aria-pressed={robotsIndex}
              >
                {robotsIndex ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div className="form-section" style={{ borderBottom: 0, marginBottom: 0 }}>
            <h3>Images</h3>
            <div className="field">
              <label>Cover image</label>
              <BlogImageUpload
                blogId={blogId}
                kind="cover"
                value={coverImageUrl}
                onChange={setCoverImageUrl}
                label="Upload cover"
              />
            </div>
            <div className="field">
              <label>OG image</label>
              <BlogImageUpload
                blogId={blogId}
                kind="og"
                value={ogImageUrl}
                onChange={setOgImageUrl}
                label="Upload OG"
              />
              <small className="field-help">
                Recommended 1200×630. Falls back to cover on mentoracity if empty.
              </small>
            </div>
          </div>

          <div className="versions-row-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => router.push("/blogs")}
            >
              Back to list
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
