import type { User } from "@supabase/supabase-js";

/**
 * Resolves the admin role from both Auth claims and the application's profiles table.
 * The profiles table is the source of truth for existing MentoraCity users.
 */
export async function isAdmin(supabase: any, user: User) {
  const claimRole = user.user_metadata?.role ?? user.app_metadata?.role;
  if (String(claimRole ?? "").trim().toUpperCase() === "A") return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (String(profile?.role ?? "").trim().toUpperCase() === "A") return true;

  // Fallback for legacy/imported profile rows whose UUID differs from auth.users.id.
  if (user.email) {
    const { data: emailProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    return String(emailProfile?.role ?? "").trim().toUpperCase() === "A";
  }
  return false;
}
