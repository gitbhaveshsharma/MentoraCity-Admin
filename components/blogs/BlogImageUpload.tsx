"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

type BlogImageUploadProps = {
  blogId: string;
  kind?: "cover" | "og";
  value?: string | null;
  onChange: (url: string) => void;
  label?: string;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024;

export function BlogImageUpload({
  blogId,
  kind = "cover",
  value,
  onChange,
  label = "Upload image",
}: BlogImageUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      return toast.error("Unsupported image", {
        description: "Use JPG, PNG, WebP, or GIF.",
      });
    }
    if (file.size > MAX_BYTES) {
      return toast.error("Image is too large", {
        description: "Images must be 2MB or smaller.",
      });
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind === "og" ? "cover" : kind);
      form.append("blog_id", blogId);
      const response = await fetch("/api/blogs/upload", {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Upload failed");
      onChange(payload.url as string);
      toast.success("Image uploaded");
    } catch (error) {
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="og-upload-row">
        {value ? (
          <img src={value} alt="Preview" className="og-upload-thumb" />
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : label}
        </button>
        {value ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange("")}
            disabled={busy}
          >
            Clear
          </button>
        ) : null}
        <input
          ref={input}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png,.webp,.gif"
          onChange={(event) =>
            event.target.files?.[0] && void upload(event.target.files[0])
          }
        />
      </div>
    </div>
  );
}
