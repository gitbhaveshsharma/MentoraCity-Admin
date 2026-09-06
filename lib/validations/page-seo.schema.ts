import { z } from "zod";
import { normalizePath } from "@/lib/seo/pages/path";

const cleanText = (min: number, max: number) =>
  z
    .string()
    .min(min, `Must be at least ${min} characters`)
    .max(max, `Must be at most ${max} characters`)
    .refine((value) => !/[<>\r\n\t]/.test(value), "No HTML tags or line breaks");

export const pageSeoSchema = z.object({
  path: z
    .string()
    .min(1)
    .transform(normalizePath)
    .refine((value) => value.startsWith("/"), "Path must start with /"),
  title: cleanText(30, 70),
  description: cleanText(50, 160),
  heading: z.string().max(120).optional().or(z.literal("")),
  subheading: z.string().max(240).optional().or(z.literal("")),
  keywords: z.string().max(500).optional().or(z.literal("")),
  og_title: z.string().max(70).optional().or(z.literal("")),
  og_description: z.string().max(160).optional().or(z.literal("")),
  og_image: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || /^https?:\/\//i.test(value), "OG image must be a valid URL"),
  canonical: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || /^https?:\/\//i.test(value), "Canonical must be a valid URL"),
  robots_index: z.boolean(),
  robots_follow: z.boolean(),
  page_content: z.string().max(20000).optional().or(z.literal("")),
  is_active: z.boolean(),
});

export type PageSeoSchemaValues = z.infer<typeof pageSeoSchema>;

/** Tracked fields for page override version diffs. */
export const PAGE_SEO_TRACKED_FIELDS = [
  "title",
  "description",
  "heading",
  "subheading",
  "keywords",
  "og_title",
  "og_description",
  "og_image",
  "canonical",
  "robots_index",
  "robots_follow",
  "page_content",
  "is_active",
] as const;

export type PageSeoTrackedField = (typeof PAGE_SEO_TRACKED_FIELDS)[number];
