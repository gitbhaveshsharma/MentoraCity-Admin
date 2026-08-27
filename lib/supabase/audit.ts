import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAuditClient() {
  const url = process.env.SEO_AUDIT_SUPABASE_URL;
  const key = process.env.SEO_AUDIT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SEO audit database is not configured");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
