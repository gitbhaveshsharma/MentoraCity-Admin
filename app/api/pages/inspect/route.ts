import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  gscConfigured,
  gscConfigurationError,
  inspectUrl,
  parseInspectResult,
  reportGscError,
  validateAuditPageUrl,
} from "@/lib/gsc";
import { runLivePageTest } from "@/lib/seo/pages/live-test";
import { upsertInspection } from "@/lib/seo/pages/inspections";
import { inspectRequestSchema } from "@/lib/validations/index.schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = inspectRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pageUrl = new URL(parsed.data.page_url).toString();
  const propertyCheck = validateAuditPageUrl(pageUrl);
  if (!propertyCheck.valid) {
    return NextResponse.json({ error: propertyCheck.message }, { status: 400 });
  }

  if (!gscConfigured()) {
    return NextResponse.json(
      { error: gscConfigurationError() ?? "Search Console is not configured" },
      { status: 503 },
    );
  }

  let gscError: string | null = null;
  let parsedInspect = parseInspectResult(null);
  try {
    parsedInspect = parseInspectResult(await inspectUrl(pageUrl));
  } catch (error) {
    const reported = reportGscError("URL inspection", error);
    gscError = reported.message;
    parsedInspect = { ...parseInspectResult(null), index_status: "ERROR" };
  }

  const live = parsed.data.live ? await runLivePageTest(pageUrl) : null;

  try {
    const inspection = await upsertInspection({
      pageUrl,
      gsc: parsedInspect,
      live,
      gscError,
      inspectedBy: user.id,
    });
    return NextResponse.json({ inspection, live });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not store inspection" },
      { status: 500 },
    );
  }
}
