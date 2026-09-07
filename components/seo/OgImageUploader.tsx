"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 500 * 1024;

type OgImageUploaderProps = {
  /** Storage object key inside the coaching-media bucket. */
  uploadKey: string;
  value?: string;
  onChange: (url: string) => void;
  /** @deprecated Prefer uploadKey */
  centerId?: string;
  /** @deprecated Prefer uploadKey */
  branchId?: string;
};

function resolveUploadKey(props: OgImageUploaderProps): string {
  if (props.uploadKey) return props.uploadKey;
  if (props.centerId && props.branchId) {
    return `${props.centerId}/og-${props.branchId}.webp`;
  }
  return `pages/og-${Date.now()}.webp`;
}

export function OgImageUploader(props: OgImageUploaderProps) {
  const { value, onChange } = props;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dimensions, setDimensions] = useState<string | null>(null);

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      return toast.error("Unsupported image", {
        description: "Use JPG, PNG, or WebP.",
      });
    }
    if (file.size > MAX_BYTES) {
      return toast.error("Image is too large", {
        description: "OG images must be 500KB or smaller.",
      });
    }

    const preview = new Image();
    preview.onload = () => {
      if (preview.width !== 1200 || preview.height !== 630) {
        setDimensions(`${preview.width}×${preview.height}`);
        toast.warning("OG image dimensions", {
          description: "Recommended dimensions are 1200×630px.",
        });
      } else {
        setDimensions(null);
      }
    };
    preview.src = URL.createObjectURL(file);

    setBusy(true);
    try {
      const path = resolveUploadKey(props);
      const client = createClient();
      const { error } = await client.storage
        .from("coaching-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = client.storage.from("coaching-media").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("OG image uploaded", {
        description: "The preview URL was updated.",
      });
    } catch (error) {
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "Could not upload image",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="og-upload-row">
        {value && <img src={value} alt="OG preview" className="og-upload-thumb" />}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : "Upload image"}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png,.webp"
          onChange={(event) =>
            event.target.files?.[0] && void upload(event.target.files[0])
          }
        />
      </div>
      {dimensions && (
        <small className="counter invalid">
          Selected size {dimensions}; 1200×630px is recommended.
        </small>
      )}
    </div>
  );
}
