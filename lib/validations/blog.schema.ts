import { z } from "zod";
import { normalizeSlug } from "@/lib/blogs/slug";

export const blogStatuses = [
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
] as const;

const optionalUrl = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional();

export const blogCreateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  slug: z
    .string()
    .min(1)
    .max(120)
    .transform(normalizeSlug)
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), "Invalid slug"),
});

export const blogUpdateSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z
    .string()
    .min(1)
    .max(120)
    .transform(normalizeSlug)
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), "Invalid slug"),
  excerpt: z.string().max(500).optional().nullable().or(z.literal("")),
  content_html: z.string().max(500_000).optional().default(""),
  content_json: z.record(z.unknown()).optional().default({}),
  status: z.enum(blogStatuses).optional(),
  published_at: z.string().datetime().optional().nullable().or(z.literal("")),
  scheduled_at: z.string().datetime().optional().nullable().or(z.literal("")),
  meta_title: z.string().max(70).optional().nullable().or(z.literal("")),
  meta_description: z.string().max(160).optional().nullable().or(z.literal("")),
  canonical_url: optionalUrl,
  og_image_url: optionalUrl,
  robots_index: z.boolean().optional().default(true),
  author_name: z.string().max(120).optional().nullable().or(z.literal("")),
  cover_image_url: optionalUrl,
  tags: z.array(z.string().max(40)).max(20).optional().default([]),
  related_paths: z
    .array(z.string().max(200))
    .max(20)
    .optional()
    .default([]),
});

export type BlogCreateValues = z.infer<typeof blogCreateSchema>;
export type BlogUpdateValues = z.infer<typeof blogUpdateSchema>;
