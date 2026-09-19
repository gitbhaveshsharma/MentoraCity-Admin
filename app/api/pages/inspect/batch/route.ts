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
import { upsertInspection } from "@/lib/seo/pages/inspections";
import { inspectBatchSchema } from "@/lib/validations/index.schema";
import type { UrlInspectionRecord } from "@/lib/seo/pages/types";

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

  const parsed = inspectBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!gscConfigured()) {
    return NextResponse.json(
      { error: gscConfigurationError() ?? "Search Console is not configured" },
      { status: 503 },
    );
  }

  const inspections: UrlInspectionRecord[] = [];
  const errors: Array<{ page_url: string; message: string }> = [];
  const queue = [...parsed.data.page_urls];
  const CONCURRENCY = 4;

  const worker = async () => {
    while (queue.length > 0) {
      const raw = queue.shift();
      if (!raw) break;

      let pageUrl: string;
      try {
        pageUrl = new URL(raw).toString();
      } catch {
        errors.push({ page_url: raw, message: "Invalid URL format" });
        continue;
      }

      const propertyCheck = validateAuditPageUrl(pageUrl);
      if (!propertyCheck.valid) {
        errors.push({ page_url: pageUrl, message: propertyCheck.message ?? "Invalid URL" });
        continue;
      }

      try {
        const parsedInspect = parseInspectResult(await inspectUrl(pageUrl));
        const saved = await upsertInspection({
          pageUrl,
          gsc: parsedInspect,
          inspectedBy: user.id,
        });
        inspections.push(saved);
      } catch (error) {
        const reported = reportGscError("URL inspection", error);
        errors.push({ page_url: pageUrl, message: reported.message });
        try {
          const errSaved = await upsertInspection({
            pageUrl,
            gsc: { ...parseInspectResult(null), index_status: "ERROR" },
            gscError: reported.message,
            inspectedBy: user.id,
          });
          inspections.push(errSaved);
        } catch {
          /* storage optional */
        }
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, parsed.data.page_urls.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return NextResponse.json({ inspections, errors });
}
