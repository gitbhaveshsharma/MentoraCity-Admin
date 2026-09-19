const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "figure",
  "figcaption",
  "img",
  "span",
  "div",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "title",
  "class",
  "style",
  "data-align",
  "width",
  "height",
];

type PurifyLike = {
  sanitize: (html: string, options?: Record<string, unknown>) => string;
};

let purifierInstance: PurifyLike | null = null;

function getPurifier(): PurifyLike | null {
  if (purifierInstance) return purifierInstance;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("isomorphic-dompurify");
    purifierInstance = (mod.default ?? mod) as PurifyLike;
  } catch (error) {
    console.warn("[sanitize] isomorphic-dompurify not available, using fallback:", error);
  }
  return purifierInstance;
}

/** Sanitize TipTap HTML before persist / mentoracity render. */
export function sanitizeBlogHtml(html: string): string {
  if (!html) return "";
  const purifier = getPurifier();
  if (purifier && typeof purifier.sanitize === "function") {
    try {
      return purifier.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: true,
      });
    } catch {
      /* fallback below */
    }
  }

  // Safe fallback to strip script/iframe tags if DOMPurify fails to load in serverless container
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/javascript:[^"']+/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
}

/** Plain-text excerpt helper from HTML when excerpt field is empty. */
export function htmlToPlainText(html: string, max = 160): string {
  const text = (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
