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
    let userMessage = reported.message;

    if (
      userMessage.includes("has not been used in project") ||
      userMessage.includes("accessNotConfigured") ||
      userMessage.includes("disabled")
    ) {
      userMessage =
        "The Google Web Search Indexing API is disabled in your Google Cloud project. Please enable it by visiting: https://console.developers.google.com/apis/api/indexing.googleapis.com/overview?project=828656455104 and ensure the service account (mentoracity-seo-bot@mentoracity.iam.gserviceaccount.com) is added as an Owner in Google Search Console.";
    } else if (userMessage.includes("Permission denied") || userMessage.includes("ownership")) {
      userMessage =
        "Permission denied by Google Indexing API. The service account (mentoracity-seo-bot@mentoracity.iam.gserviceaccount.com) must be added as an Owner in Google Search Console for property sc-domain:mentoracity.com.";
    }

    try {
      await markIndexRequested({
        pageUrl,
        error: userMessage,
        inspectedBy: user.id,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: userMessage }, { status: 502 });
  }
}
