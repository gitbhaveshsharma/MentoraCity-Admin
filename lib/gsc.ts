import { google, searchconsole_v1 } from "googleapis";

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
const siteUrl = () => process.env.GSC_SITE_URL;
function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}
const credentials = loadCredentials();

// GoogleAuth manages service-account authentication and token refresh internally.
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
export const searchconsole = google.searchconsole({ version: "v1", auth });

export function gscConfigured() { return Boolean(credentials && siteUrl()); }

export async function fetchSearchAnalytics(pageUrl: string, days: number) {
  if (!gscConfigured()) return null;
  const end = new Date(); const start = new Date(end.getTime() - days * 86400000);
  const response = await searchconsole.searchanalytics.query({ siteUrl: siteUrl()!, requestBody: { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), type: "web", dimensionFilterGroups: [{ filters: [{ dimension: "page", expression: pageUrl }] }], rowLimit: 250 } });
  return { rows: (response.data.rows ?? []) as GscRow[] };
}

export async function inspectUrl(pageUrl: string) {
  if (!gscConfigured()) return null;
  const response = await searchconsole.urlInspection.index.inspect({ requestBody: { inspectionUrl: pageUrl, siteUrl: siteUrl()! } });
  return response.data as searchconsole_v1.Schema$InspectUrlIndexResponse;
}
