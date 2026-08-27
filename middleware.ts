import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdmin } from "@/lib/auth/admin";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies: Array<{ name: string; value: string; options?: any }>) => cookies.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }) } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!(await isAdmin(supabase, user))) return NextResponse.redirect(new URL("/unauthorized", request.url));
  return response;
}

export const config = { matcher: ["/coachings/:path*"] };
