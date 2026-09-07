import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { uploadBlogMedia } from "@/lib/blogs/queries";

const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPG, PNG, WebP, or GIF." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be 2MB or smaller." },
      { status: 400 },
    );
  }

  const kind = String(form.get("kind") ?? "inline");
  const blogId = String(form.get("blog_id") ?? "misc");
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const safeBlog = blogId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "misc";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path =
    kind === "cover"
      ? `covers/${safeBlog}/${filename}`
      : `inline/${safeBlog}/${filename}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadBlogMedia({
      file: buffer,
      contentType: file.type,
      path,
    });
    return NextResponse.json({ url, path });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not upload image",
      },
      { status: 500 },
    );
  }
}
