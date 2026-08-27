import { z } from "zod";

export const auditRequestSchema = z.object({ entity_type: z.enum(["center", "branch"]), entity_id: z.string().uuid(), triggered_by_user_id: z.string().uuid().optional() });
export type AuditRequest = z.infer<typeof auditRequestSchema>;
