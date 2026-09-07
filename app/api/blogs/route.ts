import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { createBlog, listBlogs } from "@/lib/blogs/queries";
import type { BlogStatus } from "@/lib/blogs/types";
import { blogCreateSchema } from "@/lib/validations/blog.schema";
import { slugifyTitle } from "@/lib/blogs/slug";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") as BlogStatus | "all" | null) ?? "all";
  const search = searchParams.get("search") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("page_size") ?? "20");

  try {
    const data = await listBlogs({ status, search, page, pageSize });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load blogs",
      },
      { status: error instanceof Error && error.message.includes("not configured") ? 503 : 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title : "Untitled post";
  const parsed = blogCreateSchema.safeParse({
    title,
    slug: typeof body?.slug === "string" && body.slug.trim()
      ? body.slug
      : slugifyTitle(title),
  });

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
    const blog = await createBlog(parsed.data, user.id);
    return NextResponse.json({ blog }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create blog";
    const status = message.includes("already in use") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
