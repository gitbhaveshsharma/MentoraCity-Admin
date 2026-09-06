import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { upsertOverride } from "@/lib/seo/pages/overrides";
import { pageSeoSchema } from "@/lib/validations/page-seo.schema";
import type { PageSeoFormValues } from "@/lib/seo/pages/types";

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pageSeoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid page SEO payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const values = parsed.data as PageSeoFormValues;

  try {
    const override = await upsertOverride(values, {
      userId: user.id,
      source: "manual",
    });
    return NextResponse.json({ override });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save page SEO",
      },
      { status: 500 },
    );
  }
}
