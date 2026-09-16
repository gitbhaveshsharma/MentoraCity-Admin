import { z } from "zod";

export const inspectRequestSchema = z.object({
  page_url: z.string().url(),
  live: z.boolean().optional().default(true),
});

export const inspectBatchSchema = z.object({
  page_urls: z.array(z.string().url()).min(1).max(20),
});

export const indexRequestSchema = z.object({
  page_url: z.string().url(),
});
