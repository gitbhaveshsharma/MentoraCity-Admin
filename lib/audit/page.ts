import { normalizeSeo, type SeoPayload } from "@/lib/types";

function readMeta(html: string, attribute: "name" | "property", value: string) {
  const pattern = new RegExp("<meta[^>]+" + attribute + "=[\"']" + value + "[\"'][^>]*content=[\"']([^\"']*)[\"'][^>]*>", "i");
  const reversePattern = new RegExp("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+" + attribute + "=[\"']" + value + "[\"'][^>]*>", "i");
  return pattern.exec(html)?.[1]?.trim() ?? reversePattern.exec(html)?.[1]?.trim() ?? null;
}

function readLink(html: string, rel: string) {
  const pattern = new RegExp("<link[^>]+rel=[\"']" + rel + "[\"'][^>]*href=[\"']([^\"']+)[\"'][^>]*>", "i");
  const reversePattern = new RegExp("<link[^>]+href=[\"']([^\"']+)[\"'][^>]+rel=[\"']" + rel + "[\"'][^>]*>", "i");
  return pattern.exec(html)?.[1]?.trim() ?? reversePattern.exec(html)?.[1]?.trim() ?? null;
}

export async function fetchPageSeo(pageUrl: string, fallbackName: string): Promise<SeoPayload> {
  const response = await fetch(pageUrl, { cache: "no-store", redirect: "follow", headers: { "user-agent": "MentoraCity-SEO-Audit/1.0" } });
  if (!response.ok) throw new Error("The page returned HTTP " + response.status + " and could not be audited.");
  const html = await response.text();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const description = readMeta(html, "name", "description");
  const robots = readMeta(html, "name", "robots");
  const canonical = readLink(html, "canonical");
  const schemaText = /<script[^>]+type=[\"']application\/ld\+json[\"'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1]?.trim();
  let schema: Record<string, unknown> = {};
  if (schemaText) {
    try { const parsed = JSON.parse(schemaText) as unknown; schema = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; } catch { schema = {}; }
  }
  return normalizeSeo({ seo: {
    title: { source: title ? "custom" : "generated", custom: title, generated: title ?? fallbackName },
    description: { source: description ? "custom" : "generated", custom: description, generated: description ?? fallbackName },
    canonical_url: canonical ?? pageUrl,
    robots: { index: !robots?.toLowerCase().includes("noindex"), follow: !robots?.toLowerCase().includes("nofollow") },
    og: { title: readMeta(html, "property", "og:title") ?? title ?? fallbackName, description: readMeta(html, "property", "og:description") ?? description ?? "", image: readMeta(html, "property", "og:image") ?? "", url: canonical ?? pageUrl, type: "website", locale: "en_IN" },
    schema,
  } }, fallbackName, pageUrl);
}