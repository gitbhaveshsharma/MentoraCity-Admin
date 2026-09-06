import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { getBlogById, updateBlog } from "@/lib/blogs/queries";
import { blogUpdateSchema } from "@/lib/validations/blog.schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const blog = await getBlogById(id);
    if (!blog) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ blog });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load blog" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = blogUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid blog payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const blog = await updateBlog(
      id,
      {
        ...parsed.data,
        excerpt: parsed.data.excerpt || null,
        meta_title: parsed.data.meta_title || null,
        meta_description: parsed.data.meta_description || null,
        canonical_url: parsed.data.canonical_url || null,
        og_image_url: parsed.data.og_image_url || null,
        author_name: parsed.data.author_name || null,
        cover_image_url: parsed.data.cover_image_url || null,
        published_at: parsed.data.published_at || null,
        scheduled_at: parsed.data.scheduled_at || null,
      },
      user.id,
    );
    return NextResponse.json({ blog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save blog";
    const status = message.includes("already in use") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
