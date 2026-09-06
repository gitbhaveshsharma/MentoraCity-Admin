import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { fetchPageSeo } from "@/lib/audit/page";
import {
  emptyPageSeoForm,
  formFromScrapedSeo,
  overrideToForm,
} from "@/lib/seo/pages/mapper";
import { getOverrideByPath } from "@/lib/seo/pages/overrides";
import { normalizePath, pathToAbsoluteUrl } from "@/lib/seo/pages/path";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pathParam = new URL(request.url).searchParams.get("path");
  if (!pathParam) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const path = normalizePath(pathParam);
  const pageUrl = pathToAbsoluteUrl(path);

  try {
    const override = await getOverrideByPath(path);
    if (override) {
      return NextResponse.json({
        override,
        form: overrideToForm(override),
        scraped: false,
      });
    }

    let form = emptyPageSeoForm(path);
    if (pageUrl) {
      try {
        const scraped = await fetchPageSeo(pageUrl, path);
        form = formFromScrapedSeo(path, scraped);
      } catch {
        /* keep empty defaults */
      }
    }

    return NextResponse.json({
      override: null,
      form,
      scraped: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load page SEO",
      },
      { status: 500 },
    );
  }
}
