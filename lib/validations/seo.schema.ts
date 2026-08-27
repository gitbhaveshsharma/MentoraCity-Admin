import { z } from "zod";

const cleanText = (min: number, max: number) => z.string().min(min).max(max).refine((value) => !/[<>\r\n\t]/.test(value), "No HTML tags or line breaks");

export const seoSchema = z.object({
  titleSource: z.enum(["generated", "custom"]), titleCustom: z.string().nullable(), generatedTitle: z.string(),
  descriptionSource: z.enum(["generated", "custom"]), descriptionCustom: z.string().nullable(), generatedDescription: z.string(),
  canonicalUrl: z.string().url(), index: z.boolean(), follow: z.boolean(), ogTitle: z.string().min(1), ogDescription: z.string().max(160),
  twitterTitle: z.string().min(1), twitterDescription: z.string().max(160), ogImage: z.string().url(),
}).superRefine((data, ctx) => {
  if (data.titleSource === "custom") { const result = cleanText(30, 70).safeParse(data.titleCustom ?? ""); if (!result.success) ctx.addIssue({ code: "custom", path: ["titleCustom"], message: result.error.issues[0].message }); }
  if (data.descriptionSource === "custom") { const result = cleanText(50, 160).safeParse(data.descriptionCustom ?? ""); if (!result.success) ctx.addIssue({ code: "custom", path: ["descriptionCustom"], message: result.error.issues[0].message }); }
});

export type SeoFormValues = z.infer<typeof seoSchema>;
