import { z } from "zod";

export const auditRequestSchema = z.object({
  entity_type: z.enum(["center", "branch", "page"]),
  entity_id: z.string().uuid().optional(),
  page_url: z.string().url().optional(),
  page_name: z.string().trim().min(1).max(200).optional(),
  triggered_by_user_id: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.entity_type === "page" && !value.page_url) context.addIssue({ code: z.ZodIssueCode.custom, path: ["page_url"], message: "A URL is required for an other page audit" });
  if (value.entity_type !== "page" && !value.entity_id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["entity_id"], message: "A center or branch id is required" });
});
export type AuditRequest = z.infer<typeof auditRequestSchema>;