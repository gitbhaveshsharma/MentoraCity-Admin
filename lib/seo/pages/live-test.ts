import { pagespeed, reportGscError } from "@/lib/gsc";

export type LivePageTest = {
  ok: boolean;
  http_status: number | null;
  final_url: string | null;
  performance_score: number | null;
  seo_score: number | null;
  accessibility_score: number | null;
  screenshot_data_url: string | null;
  error: string | null;
};

function score100(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function screenshotFromLighthouse(result: Record<string, unknown> | undefined) {
  const audits = result?.audits as Record<string, { details?: { data?: string } }> | undefined;
  return (
    audits?.["final-screenshot"]?.details?.data ??
    audits?.["full-page-screenshot"]?.details?.data ??
    null
  );
}

async function fetchHttpStatus(pageUrl: string): Promise<{ status: number | null; error: string | null }> {
  try {
    const response = await fetch(pageUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: { "user-agent": "MentoraCity-SEO-LiveTest/1.0" },
    });
    return { status: response.status, error: response.ok ? null : `The page returned HTTP ${response.status}` };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : "Live fetch failed" };
  }
}

async function runPagespeed(pageUrl: string) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (apiKey) {
    const params = new URLSearchParams({
      url: pageUrl,
      strategy: "mobile",
      key: apiKey,
    });
    for (const category of ["PERFORMANCE", "SEO", "ACCESSIBILITY"]) {
      params.append("category", category);
    }
    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = payload.error as { message?: string } | undefined;
      throw new Error(error?.message ?? `PageSpeed returned HTTP ${response.status}`);
    }
    return payload;
  }

  const response = await pagespeed.pagespeedapi.runpagespeed({
    url: pageUrl,
    strategy: "MOBILE",
    category: ["PERFORMANCE", "SEO", "ACCESSIBILITY"],
  });
  return response.data as Record<string, unknown>;
}

export async function runLivePageTest(pageUrl: string): Promise<LivePageTest> {
  const http = await fetchHttpStatus(pageUrl);
  try {
    const data = await runPagespeed(pageUrl);
    const lighthouse = data.lighthouseResult as Record<string, unknown> | undefined;
    const categories = lighthouse?.categories as
      | Record<string, { score?: number | null }>
      | undefined;
    return {
      ok: http.status != null && http.status < 400,
      http_status: http.status,
      final_url: (lighthouse?.finalUrl as string | undefined) ?? pageUrl,
      performance_score: score100(categories?.performance?.score ?? null),
      seo_score: score100(categories?.seo?.score ?? null),
      accessibility_score: score100(categories?.accessibility?.score ?? null),
      screenshot_data_url: screenshotFromLighthouse(lighthouse),
      error: http.error,
    };
  } catch (error) {
    reportGscError("PageSpeed live test", error);
    return {
      ok: http.status != null && http.status < 400,
      http_status: http.status,
      final_url: pageUrl,
      performance_score: null,
      seo_score: null,
      accessibility_score: null,
      screenshot_data_url: null,
      error:
        error instanceof Error
          ? error.message
          : "Live test could not run PageSpeed Insights",
    };
  }
}
