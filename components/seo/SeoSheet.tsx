"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SeoPayload } from "@/lib/types";
import { seoSchema, type SeoFormValues } from "@/lib/validations/seo.schema";
import { OgImageUploader } from "@/components/seo/OgImageUploader";
import { SeoVersionHistoryPanel } from "@/components/seo/SeoVersionHistoryPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

function Counter({
  value,
  min,
  max,
}: {
  value?: string;
  min: number;
  max: number;
}) {
  const count = value?.length ?? 0;
  return (
    <span
      className={"counter " + (count < min || count > max ? "invalid" : "")}
    >
      {count} / {max}
    </span>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromCanonical(canonical: string) {
  try {
    const url = new URL(canonical);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? "";
  } catch {
    return "";
  }
}

function canonicalWithSlug(canonical: string, slug: string) {
  try {
    const url = new URL(canonical);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length) segments[segments.length - 1] = slug;
    else if (slug) segments.push(slug);
    url.pathname = "/" + segments.join("/");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return canonical;
  }
}

export function SeoSheet({
  open,
  onClose,
  seo,
  entityName,
  entityId,
  entityType = "branch",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  seo: SeoPayload;
  entityName: string;
  entityId: string;
  entityType?: "center" | "branch";
  onSaved?: (seo: SeoPayload) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [schema, setSchema] = useState(seo.schema);
  const [schemaText, setSchemaText] = useState(
    JSON.stringify(seo.schema, null, 2),
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaMode, setSchemaMode] = useState<"read" | "edit">("read");
  const [slug, setSlug] = useState(slugFromCanonical(seo.canonical_url));
  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<SeoFormValues>({
    resolver: zodResolver(seoSchema),
    defaultValues: {
      titleSource: seo.title.source,
      titleCustom: seo.title.custom,
      generatedTitle: seo.title.generated,
      descriptionSource: seo.description.source,
      descriptionCustom: seo.description.custom,
      generatedDescription: seo.description.generated,
      canonicalUrl: seo.canonical_url,
      index: seo.robots.index,
      follow: seo.robots.follow,
      ogTitle: seo.og.title,
      ogDescription: seo.og.description,
      twitterTitle: seo.twitter.title,
      twitterDescription: seo.twitter.description,
      ogImage: seo.og.image,
    },
  });
  const titleSource = watch("titleSource");
  const descriptionSource = watch("descriptionSource");
  const index = watch("index");
  const canonicalPreview = canonicalWithSlug(seo.canonical_url, slugify(slug));

  useEffect(() => {
    reset({
      titleSource: seo.title.source,
      titleCustom: seo.title.custom,
      generatedTitle: seo.title.generated,
      descriptionSource: seo.description.source,
      descriptionCustom: seo.description.custom,
      generatedDescription: seo.description.generated,
      canonicalUrl: seo.canonical_url,
      index: seo.robots.index,
      follow: seo.robots.follow,
      ogTitle: seo.og.title,
      ogDescription: seo.og.description,
      twitterTitle: seo.twitter.title,
      twitterDescription: seo.twitter.description,
      ogImage: seo.og.image,
    });
    setSlug(slugFromCanonical(seo.canonical_url));
    setSchema(seo.schema);
    setSchemaText(JSON.stringify(seo.schema, null, 2));
    setSchemaError(null);
    setSchemaMode("read");
  }, [seo, reset]);

  if (!open) return null;

  const parseSchema = () => {
    try {
      const parsed = JSON.parse(schemaText) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error("Schema must be a JSON object.");
      setSchemaError(null);
      return parsed as Record<string, unknown>;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Enter valid JSON-LD.";
      setSchemaError(message);
      toast.error("Schema JSON is invalid", { description: message });
      return null;
    }
  };

  const submit = async (values: SeoFormValues) => {
    const normalizedSlug = slugify(slug);
    if (!normalizedSlug)
      return toast.error("Enter a valid URL slug", {
        description: "Use lowercase letters, numbers, and hyphens.",
      });
    const nextSchema = parseSchema();
    if (!nextSchema) return;
    const canonicalUrl = canonicalWithSlug(seo.canonical_url, normalizedSlug);
    setSaving(true);
    const next: SeoPayload = {
      ...seo,
      title: {
        source: values.titleSource,
        custom: values.titleSource === "custom" ? values.titleCustom : null,
        generated: values.generatedTitle,
      },
      description: {
        source: values.descriptionSource,
        custom:
          values.descriptionSource === "custom"
            ? values.descriptionCustom
            : null,
        generated: values.generatedDescription,
      },
      canonical_url: canonicalUrl,
      robots: { index: values.index, follow: values.follow },
      og: {
        ...seo.og,
        title: values.ogTitle,
        description: values.ogDescription,
        image: values.ogImage,
        url: canonicalUrl,
      },
      twitter: {
        ...seo.twitter,
        title: values.twitterTitle,
        description: values.twitterDescription,
        image: values.ogImage,
      },
      schema: nextSchema,
      version: seo.version + 1,
    };
    onSaved?.(next);
    try {
      const response = await fetch("/api/seo/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entityType, id: entityId, seo: next }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error ??
            "Could not save changes",
        );
      toast.success("SEO updated", {
        description:
          "Custom metadata, slug, and Schema.org JSON-LD were saved.",
      });
    } catch (error) {
      onSaved?.(seo);
      toast.error("Save failed", {
        description:
          error instanceof Error ? error.message : "Could not save changes",
      });
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    try {
      const response = await fetch("/api/seo/regenerate-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entityType, id: entityId }),
      });
      if (!response.ok) throw new Error("Schema regeneration failed");
      const data = await response.json();
      const nextSchema = data.schema ?? schema;
      setSchema(nextSchema);
      setSchemaText(JSON.stringify(nextSchema, null, 2));
      setSchemaError(null);
      toast.info("Schema regenerated", {
        description: "JSON-LD rebuilt from latest data",
      });
    } catch {
      const generated = {
        ...schema,
        name: entityName,
        dateModified: new Date().toISOString(),
      };
      setSchema(generated);
      setSchemaText(JSON.stringify(generated, null, 2));
      setSchemaError(null);
      toast.info("Schema regenerated", {
        description: "Preview rebuilt from current entity data",
      });
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Edit SEO"
      >
        <header className="sheet-head">
          <div>
            <h2>Edit SEO</h2>
            <p>{entityName} · SEO metadata only</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form
          id="seo-form"
          className="sheet-body"
          onSubmit={handleSubmit(submit)}
        >
          <Alert className="canonical-alert">
            <AlertTitle>Canonical URL is managed from the slug</AlertTitle>
            <AlertDescription>
              Only the final URL slug is editable. Changing it automatically
              updates the canonical URL and social URL. Do not paste a different
              domain or path.
            </AlertDescription>
          </Alert>
          <div className="seo-alert">
            Custom values are always preferred. When a valid custom title or
            description is provided, the website uses it instead of the
            generated value.
          </div>
          <div className="form-section">
            <h3>A · Title</h3>
            <div className="field">
              <label>
                SEO title{" "}
                <Counter
                  value={
                    titleSource === "custom"
                      ? (watch("titleCustom") ?? "")
                      : watch("generatedTitle")
                  }
                  min={30}
                  max={70}
                />
              </label>
              <div className="pills">
                <button
                  type="button"
                  className={
                    "pill " + (titleSource === "generated" ? "active" : "")
                  }
                  onClick={() => setValue("titleSource", "generated")}
                >
                  Use generated
                </button>
                <button
                  type="button"
                  className={
                    "pill " + (titleSource === "custom" ? "active" : "")
                  }
                  onClick={() => setValue("titleSource", "custom")}
                >
                  Use custom
                </button>
              </div>
            </div>
            {titleSource === "generated" ? (
              <div className="field">
                <input {...register("generatedTitle")} readOnly />
              </div>
            ) : (
              <div className="field">
                <input
                  {...register("titleCustom")}
                  placeholder="30–70 characters"
                />
                {errors.titleCustom && (
                  <small className="counter invalid">
                    {errors.titleCustom.message}
                  </small>
                )}
              </div>
            )}
          </div>
          <div className="form-section">
            <h3>B · Meta description</h3>
            <div className="field">
              <label>
                Description{" "}
                <Counter
                  value={
                    descriptionSource === "custom"
                      ? (watch("descriptionCustom") ?? "")
                      : watch("generatedDescription")
                  }
                  min={50}
                  max={160}
                />
              </label>
              <div className="pills">
                <button
                  type="button"
                  className={
                    "pill " +
                    (descriptionSource === "generated" ? "active" : "")
                  }
                  onClick={() => setValue("descriptionSource", "generated")}
                >
                  Use generated
                </button>
                <button
                  type="button"
                  className={
                    "pill " + (descriptionSource === "custom" ? "active" : "")
                  }
                  onClick={() => setValue("descriptionSource", "custom")}
                >
                  Use custom
                </button>
              </div>
            </div>
            {descriptionSource === "generated" ? (
              <Textarea {...register("generatedDescription")} readOnly />
            ) : (
              <Textarea
                {...register("descriptionCustom")}
                placeholder="50–160 characters"
              />
            )}
            {errors.descriptionCustom && (
              <small className="counter invalid">
                {errors.descriptionCustom.message}
              </small>
            )}
          </div>
          <div className="form-section">
            <h3>C · Canonical URL</h3>
            <div className="field">
              <label>
                URL slug <span className="badge badge-source">Editable</span>
              </label>
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="page-slug"
                autoComplete="off"
              />
              <small className="field-help">
                Lowercase letters, numbers, and hyphens are used in the URL.
              </small>
            </div>
            <div className="field">
              <label>
                Canonical URL{" "}
                <span className="badge badge-muted">Read only</span>
              </label>
              <input
                {...register("canonicalUrl")}
                value={canonicalPreview}
                readOnly
                aria-readonly="true"
              />
            </div>
          </div>
          <div className="form-section">
            <h3>D · Robots</h3>
            <div className="info-row">
              <span>Index this page</span>
              <button
                type="button"
                className={"toggle " + (index ? "on" : "")}
                onClick={() => setValue("index", !index)}
                aria-label="Toggle index"
              />
            </div>
            <div className="info-row">
              <span>Follow links</span>
              <button
                type="button"
                className={"toggle " + (watch("follow") ? "on" : "")}
                onClick={() => setValue("follow", !watch("follow"))}
                aria-label="Toggle follow"
              />
            </div>
            {!index && (
              <div className="warning">
                This page will be excluded from search engines.
              </div>
            )}
          </div>
          <div className="form-section">
            <h3>E · Social preview</h3>
            <div className="field">
              <label>OG title</label>
              <input {...register("ogTitle")} />
            </div>
            <div className="field">
              <label>
                OG description{" "}
                <Counter value={watch("ogDescription")} min={0} max={160} />
              </label>
              <Textarea {...register("ogDescription")} />
            </div>
            <div className="field">
              <label>OG image</label>
              <OgImageUploader
                centerId={
                  entityType === "center" ? entityId : seo.canonical_url
                }
                branchId={entityId}
                value={watch("ogImage")}
                onChange={(url) =>
                  setValue("ogImage", url, { shouldDirty: true })
                }
              />
              <input
                {...register("ogImage")}
                placeholder="Or paste an image URL"
                style={{ marginTop: 8 }}
              />
              <small
                style={{ color: "var(--color-muted-foreground)", fontSize: 11 }}
              >
                Recommended: 1200×630px, max 500KB, .webp preferred.
              </small>
            </div>
            <div className="field">
              <label>Twitter title</label>
              <input {...register("twitterTitle")} />
            </div>
            <div className="field">
              <label>
                Twitter description{" "}
                <Counter
                  value={watch("twitterDescription")}
                  min={0}
                  max={160}
                />
              </label>
              <Textarea {...register("twitterDescription")} />
            </div>
          </div>
          <div className="form-section">
            <h3>F · Schema.org JSON-LD</h3>
            <div className="field">
              <label>
                Schema JSON{" "}
                <span
                  className={
                    "badge " +
                    (schemaMode === "edit" ? "badge-source" : "badge-muted")
                  }
                >
                  {schemaMode === "edit" ? "Editable" : "Read only"}
                </span>
              </label>
              <div className="pills">
                <button
                  type="button"
                  className={"pill " + (schemaMode === "read" ? "active" : "")}
                  onClick={() => {
                    const parsed = parseSchema();
                    if (!parsed && schemaMode === "edit") return;
                    if (parsed) {
                      setSchema(parsed);
                      setSchemaText(JSON.stringify(parsed, null, 2));
                    }
                    setSchemaMode("read");
                  }}
                >
                  Read
                </button>
                <button
                  type="button"
                  className={"pill " + (schemaMode === "edit" ? "active" : "")}
                  onClick={() => setSchemaMode("edit")}
                >
                  Edit
                </button>
              </div>
              <Textarea
                className="schema-editor"
                value={schemaText}
                readOnly={schemaMode === "read"}
                onChange={(event) => {
                  if (schemaMode === "read") return;
                  setSchemaText(event.target.value);
                  setSchemaError(null);
                }}
                spellCheck={false}
                aria-readonly={schemaMode === "read"}
                aria-describedby="schema-help"
              />
              {schemaError && (
                <small id="schema-help" className="counter invalid">
                  {schemaError}
                </small>
              )}
              {!schemaError && (
                <small id="schema-help" className="field-help">
                  {schemaMode === "read"
                    ? "Switch to Edit to change JSON-LD. Valid JSON is required before saving."
                    : "Valid JSON-LD is saved with this SEO configuration."}
                </small>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              onClick={regenerate}
            >
              ↻ Regenerate schema
            </button>
          </div>
          <SeoVersionHistoryPanel
            open={open}
            entityId={entityId}
            entityType={entityType}
            onRestored={(restored) => {
              onSaved?.(restored);
              reset({
                titleSource: restored.title.source,
                titleCustom: restored.title.custom,
                generatedTitle: restored.title.generated,
                descriptionSource: restored.description.source,
                descriptionCustom: restored.description.custom,
                generatedDescription: restored.description.generated,
                canonicalUrl: restored.canonical_url,
                index: restored.robots.index,
                follow: restored.robots.follow,
                ogTitle: restored.og.title,
                ogDescription: restored.og.description,
                twitterTitle: restored.twitter.title,
                twitterDescription: restored.twitter.description,
                ogImage: restored.og.image,
              });
              setSlug(slugFromCanonical(restored.canonical_url));
              setSchema(restored.schema);
              setSchemaText(JSON.stringify(restored.schema, null, 2));
              setSchemaError(null);
              setSchemaMode("read");
            }}
          />
        </form>
        <footer className="sheet-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Discard changes
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="seo-form"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save SEO"}
          </button>
        </footer>
      </section>
    </>
  );
}
