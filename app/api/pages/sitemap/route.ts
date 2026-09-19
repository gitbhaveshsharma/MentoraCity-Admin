import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { buildSitemapPayload } from "@/lib/seo/pages/overview";
import { syncClientSitemapUrls } from "@/lib/seo/pages/sitemap";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const force = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const data = await buildSitemapPayload({ force });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load sitemap" },
      { status: 500 },
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
  const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
  const validUrls = rawUrls.filter(
    (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u),
  );

  if (!validUrls.length) {
    return NextResponse.json({ error: "No valid URLs provided" }, { status: 400 });
  }

  try {
    await syncClientSitemapUrls(validUrls);
    const data = await buildSitemapPayload({ force: true });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sync sitemap URLs" },
      { status: 500 },
    );
  }
}
