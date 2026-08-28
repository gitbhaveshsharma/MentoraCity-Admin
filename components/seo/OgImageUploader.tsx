"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
export function OgImageUploader({ centerId, branchId, value, onChange }: { centerId: string; branchId: string; value?: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [dimensions, setDimensions] = useState<string | null>(null);
  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) return toast.error("Unsupported image", { description: "Use JPG, PNG, or WebP." });
    if (file.size > 500 * 1024) return toast.error("Image is too large", { description: "OG images must be 500KB or smaller." });
    const preview = new Image(); preview.onload = () => { if (preview.width !== 1200 || preview.height !== 630) { setDimensions(`${preview.width}×${preview.height}`); toast.warning("OG image dimensions", { description: "Recommended dimensions are 1200×630px." }); } else setDimensions(null); }; preview.src = URL.createObjectURL(file);
    setBusy(true); try { const path = `${centerId}/og-${branchId}.webp`; const { error } = await createClient().storage.from("coaching-media").upload(path, file, { upsert: true, contentType: file.type }); if (error) throw error; const { data } = createClient().storage.from("coaching-media").getPublicUrl(path); onChange(data.publicUrl); toast.success("OG image uploaded", { description: "The preview URL was updated." }); } catch (error) { toast.error("Upload failed", { description: error instanceof Error ? error.message : "Could not upload image" }); } finally { setBusy(false); }
  }
  return <div><div className="og-upload-row">{value && <img src={value} alt="OG preview" className="og-upload-thumb" />}<button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Uploading…" : "Upload image"}</button><input ref={input} type="file" hidden accept=".jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /></div>{dimensions && <small className="counter invalid">Selected size {dimensions}; 1200×630px is recommended.</small>}</div>;
}
