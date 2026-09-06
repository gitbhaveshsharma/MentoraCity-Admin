import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { publishBlog } from "@/lib/blogs/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
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
    const blog = await publishBlog(id, user.id);
    return NextResponse.json({ blog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish blog";
    const status =
      message.includes("required") || message.includes("content") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
