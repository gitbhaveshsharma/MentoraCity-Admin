import { google, searchconsole_v1 } from "googleapis";

export type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type ServiceAccountCredentials = { client_email: string; private_key: string; project_id?: string };
const siteUrl = () => process.env.GSC_SITE_URL;
let credentialsError: string | null = null;

function loadCredentials(): ServiceAccountCredentials | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    credentialsError = "GOOGLE_SERVICE_ACCOUNT_KEY is not configured";
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      credentialsError = "GOOGLE_SERVICE_ACCOUNT_KEY must contain client_email and private_key";
      return undefined;
    }
    return parsed as ServiceAccountCredentials;
  } catch {
    credentialsError = "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON";
    return undefined;
  }
}
const credentials = loadCredentials();

const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
export const searchconsole = google.searchconsole({ version: "v1", auth });

export function gscConfigured() { return Boolean(credentials && siteUrl()); }
export function auditPropertyHost() {
  const configured = siteUrl() ?? process.env.PUBLIC_SITE_URL;
  if (!configured) return null;
  if (configured.startsWith("sc-domain:")) return configured.slice("sc-domain:".length).toLowerCase().replace(/^www\./, "");
  try { return new URL(configured).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

export function validateAuditPageUrl(pageUrl: string) {
  let candidate: URL;
  try { candidate = new URL(pageUrl); } catch { return { valid: false, message: "Enter a valid absolute page URL." }; }
  if (candidate.protocol !== "https:" && candidate.protocol !== "http:") return { valid: false, message: "Audit URLs must use http or https." };
  const configured = siteUrl() ?? process.env.PUBLIC_SITE_URL;
  const propertyHost = auditPropertyHost();
  if (!propertyHost) return { valid: false, message: "Configure GSC_SITE_URL or PUBLIC_SITE_URL before auditing a custom page." };
  const candidateHost = candidate.hostname.toLowerCase().replace(/^www\./, "");
  if (candidateHost !== propertyHost) return { valid: false, message: "This URL is outside the configured property (" + propertyHost + ")." };
  if (siteUrl() && !siteUrl()!.startsWith("sc-domain:")) {
    try {
      const property = new URL(configured!);
      const propertyPath = property.pathname.replace(/\/+$/, "");
      if (candidate.protocol !== property.protocol) return { valid: false, message: "This URL does not use the configured Search Console property protocol." };
      if (propertyPath && propertyPath !== "/" && candidate.pathname !== propertyPath && !candidate.pathname.startsWith(propertyPath + "/")) return { valid: false, message: "This URL is outside the configured Search Console URL-prefix property." };
    } catch { return { valid: false, message: "GSC_SITE_URL is not a valid Search Console property." }; }
  }
  return { valid: true, message: null };
}
export function gscConfigurationError() {
  if (!siteUrl()) return "GSC_SITE_URL is not configured";
  return credentialsError;
}

export function reportGscError(operation: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = message || "Unknown GSC error";
  console.error(`[GSC] ${operation} failed: ${safeMessage}`);
  return { operation, message: safeMessage };
}

export async function fetchSearchAnalytics(pageUrl: string | undefined, days: number, dimensions: string[] = []) {
  if (!gscConfigured()) return null;
  const end = new Date(); const start = new Date(end.getTime() - days * 86400000);
  const response = await searchconsole.searchanalytics.query({
    siteUrl: siteUrl()!,
    requestBody: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      type: "web",
      ...(dimensions.length ? { dimensions } : {}),
      ...(pageUrl ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", expression: pageUrl }] }] } : {}),
      rowLimit: 250,
    },
  });
  return { rows: (response.data.rows ?? []) as GscRow[] };
}

export async function inspectUrl(pageUrl: string) {
  if (!gscConfigured()) return null;
  const response = await searchconsole.urlInspection.index.inspect({ requestBody: { inspectionUrl: pageUrl, siteUrl: siteUrl()! } });
  return response.data as searchconsole_v1.Schema$InspectUrlIndexResponse;
}