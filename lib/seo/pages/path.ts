import { siteOrigin } from "@/lib/seo/site";

export { siteOrigin } from "@/lib/seo/site";

/** Lowercase path, leading slash, no trailing slash (except root). */
export function normalizePath(input: string): string {
  let value = input.trim();
  if (!value) return "/";
  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname;
    }
  } catch {
    /* keep raw */
  }
  value = value.split("?")[0]?.split("#")[0] ?? value;
  value = value.toLowerCase();
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value || "/";
}

export function pathToAbsoluteUrl(path: string, origin = siteOrigin()): string | null {
  if (!origin) return null;
  const normalized = normalizePath(path);
  return normalized === "/" ? origin : `${origin.replace(/\/+$/, "")}${normalized}`;
}

export function absoluteUrlToPath(pageUrl: string): string {
  return normalizePath(pageUrl);
}

export function pathUploadKey(path: string): string {
  const safe = normalizePath(path)
    .replace(/^\//, "")
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return `pages/og-${safe || "root"}.webp`;
}
