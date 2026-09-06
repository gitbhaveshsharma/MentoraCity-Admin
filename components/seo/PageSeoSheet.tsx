"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { OgImageUploader } from "@/components/seo/OgImageUploader";
import { SeoFieldCounter } from "@/components/seo/SeoFieldCounter";
import { SeoVersionHistoryPanel } from "@/components/seo/SeoVersionHistoryPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyPageSeoForm,
  overrideToForm,
  rowFromDb,
} from "@/lib/seo/pages/mapper";
import { pathUploadKey } from "@/lib/seo/pages/path";
import type { PageSeoFormValues, PageSeoOverride } from "@/lib/seo/pages/types";
import {
  pageSeoSchema,
  type PageSeoSchemaValues,
} from "@/lib/validations/page-seo.schema";

export function PageSeoSheet({
  open,
  onClose,
  path,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  onSaved?: (override: PageSeoOverride) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<PageSeoSchemaValues>({
    resolver: zodResolver(pageSeoSchema),
    defaultValues: emptyPageSeoForm(path),
  });

  const robotsIndex = watch("robots_index");
  const robotsFollow = watch("robots_follow");
  const isActive = watch("is_active");

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pages/by-path?path=${encodeURIComponent(path)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load page SEO");
        if (cancelled) return;
        const form = payload.form as PageSeoFormValues;
        reset(form);
        setOverrideId(payload.override?.id ?? null);
        setValue("path", path);
      })
      .catch((error) => {
        toast.error("Could not load page SEO", {
          description: error instanceof Error ? error.message : "Try again",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path, reset, setValue]);

  if (!open) return null;

  const submit = async (values: PageSeoSchemaValues) => {
    setSaving(true);
    try {
      const response = await fetch("/api/pages/override", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save page SEO");
      }
      const override = payload.override as PageSeoOverride;
      setOverrideId(override.id);
      reset(overrideToForm(override));
      onSaved?.(override);
      toast.success("Page SEO saved", {
        description: "Override is live for eduro and versioned for restore.",
      });
    } catch (error) {
      toast.error("Save failed", {
        description: error instanceof Error ? error.message : "Could not save",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Edit page SEO">
        <header className="sheet-head">
          <div>
            <h2>Edit page SEO</h2>
            <p>{path} · coaching_seo_overrides</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form id="page-seo-form" className="sheet-body" onSubmit={handleSubmit(submit)}>
          <Alert className="canonical-alert">
            <AlertTitle>Path is the identity key</AlertTitle>
            <AlertDescription>
              Overrides are stored by normalized path and read by the public site for
              this URL. Leave inactive to disable without deleting.
            </AlertDescription>
          </Alert>

          {loading && <p className="field-help">Loading page SEO…</p>}

          <div className="form-section">
            <h3>A · Meta</h3>
            <div className="field">
              <label>
                Title <SeoFieldCounter value={watch("title")} min={30} max={70} />
              </label>
              <input {...register("title")} placeholder="30–70 characters" />
              {errors.title && (
                <small className="counter invalid">{errors.title.message}</small>
              )}
            </div>
            <div className="field">
              <label>
                Description{" "}
                <SeoFieldCounter value={watch("description")} min={50} max={160} />
              </label>
              <Textarea {...register("description")} placeholder="50–160 characters" />
              {errors.description && (
                <small className="counter invalid">{errors.description.message}</small>
              )}
            </div>
            <div className="field">
              <label>H1 heading</label>
              <input {...register("heading")} />
            </div>
            <div className="field">
              <label>Subheading</label>
              <Textarea {...register("subheading")} />
            </div>
            <div className="field">
              <label>Keywords</label>
              <input
                {...register("keywords")}
                placeholder="comma, separated, keywords"
              />
              <small className="field-help">Stored as a text array on the override row.</small>
            </div>
          </div>

          <div className="form-section">
            <h3>B · Canonical & robots</h3>
            <div className="field">
              <label>Canonical URL</label>
              <input {...register("canonical")} placeholder="https://…" />
              {errors.canonical && (
                <small className="counter invalid">{errors.canonical.message}</small>
              )}
            </div>
            <div className="info-row">
              <span>Index this page</span>
              <button
                type="button"
                className={"toggle " + (robotsIndex ? "on" : "")}
                onClick={() => setValue("robots_index", !robotsIndex)}
                aria-label="Toggle index"
              />
            </div>
            <div className="info-row">
              <span>Follow links</span>
              <button
                type="button"
                className={"toggle " + (robotsFollow ? "on" : "")}
                onClick={() => setValue("robots_follow", !robotsFollow)}
                aria-label="Toggle follow"
              />
            </div>
            <div className="info-row">
              <span>Override active</span>
              <button
                type="button"
                className={"toggle " + (isActive ? "on" : "")}
                onClick={() => setValue("is_active", !isActive)}
                aria-label="Toggle active"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>C · Social</h3>
            <div className="field">
              <label>
                OG title <SeoFieldCounter value={watch("og_title")} min={0} max={70} />
              </label>
              <input {...register("og_title")} />
            </div>
            <div className="field">
              <label>
                OG description{" "}
                <SeoFieldCounter value={watch("og_description")} min={0} max={160} />
              </label>
              <Textarea {...register("og_description")} />
            </div>
            <div className="field">
              <label>OG image</label>
              <OgImageUploader
                uploadKey={pathUploadKey(path)}
                value={watch("og_image")}
                onChange={(url) => setValue("og_image", url, { shouldDirty: true })}
              />
              <input
                {...register("og_image")}
                placeholder="Or paste an image URL"
                style={{ marginTop: 8 }}
              />
              {errors.og_image && (
                <small className="counter invalid">{errors.og_image.message}</small>
              )}
              <small className="field-help">
                Recommended: 1200×630px, max 500KB, .webp preferred.
              </small>
            </div>
          </div>

          <div className="form-section">
            <h3>D · Page content</h3>
            <div className="field">
              <label>Intro / page content</label>
              <Textarea {...register("page_content")} className="schema-editor" />
            </div>
          </div>

          <input type="hidden" {...register("path")} />

          <SeoVersionHistoryPanel
            open={open}
            entityId={overrideId ?? ""}
            entityType="page"
            sectionTitle="E · Version history"
            onRestored={(payload) => {
              try {
                const override = rowFromDb({
                  id: overrideId ?? payload.id ?? "",
                  ...payload,
                  created_at: payload.created_at ?? new Date().toISOString(),
                  updated_at: payload.updated_at ?? new Date().toISOString(),
                });
                reset(overrideToForm(override));
                setOverrideId(override.id || overrideId);
                onSaved?.(override);
              } catch {
                toast.info("Restored", {
                  description: "Reload the sheet if fields look stale.",
                });
              }
            }}
          />
        </form>
        <footer className="sheet-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Discard
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="page-seo-form"
            disabled={saving || loading}
          >
            {saving ? "Saving…" : "Save page SEO"}
          </button>
        </footer>
      </section>
    </>
  );
}
