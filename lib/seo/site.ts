/**
 * Site host/origin helpers from env only — safe for client bundles.
 * Do not import googleapis here.
 */

export function auditPropertyHost(): string | null {
  const configured = process.env.GSC_SITE_URL ?? process.env.PUBLIC_SITE_URL;
  if (!configured) return null;
  if (configured.startsWith("sc-domain:")) {
    return configured.slice("sc-domain:".length).toLowerCase().replace(/^www\./, "");
  }
  try {
    return new URL(configured).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Prefer GSC property host, then PUBLIC_SITE_URL. */
export function siteOrigin(): string | null {
  const host = auditPropertyHost();
  if (host) return `https://${host}`;
  const publicUrl = process.env.PUBLIC_SITE_URL ?? process.env.GSC_SITE_URL;
  if (!publicUrl || publicUrl.startsWith("sc-domain:")) return null;
  try {
    const url = new URL(publicUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
