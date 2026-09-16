import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAuditClient } from "@/lib/supabase/audit";
import { isAdmin } from "@/lib/auth/admin";
import {
  gscConfigured,
  gscConfigurationError,
  requestUrlIndexing,
  reportGscError,
  validateAuditPageUrl,
} from "@/lib/gsc";
import { markIndexRequested } from "@/lib/seo/pages/inspections";
import { indexRequestSchema } from "@/lib/validations/index.schema";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = indexRequestSchema.safeParse(await request.json().catch(() => null));
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

  try {
    const result = await requestUrlIndexing(pageUrl);
    const notifyTime = result.urlNotificationMetadata?.latestUpdate?.notifyTime ?? null;
    const inspection = await markIndexRequested({
      pageUrl,
      notifyTime,
      inspectedBy: user.id,
    });
    try {
      const auditDb = createAuditClient();
      await auditDb.from("seo_activity_log").insert({
        entity_type: "page",
        action: "REINDEX_REQUESTED",
        performed_by: user.id,
        note: `Indexing requested for ${pageUrl}`,
        metadata: { page_url: pageUrl, notify_time: notifyTime },
      });
    } catch {
      /* activity log is best-effort */
    }
    return NextResponse.json({ inspection, notify_time: notifyTime });
  } catch (error) {
    const reported = reportGscError("Indexing API", error);
    try {
      await markIndexRequested({
        pageUrl,
        error: reported.message,
        inspectedBy: user.id,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: reported.message }, { status: 502 });
  }
}
