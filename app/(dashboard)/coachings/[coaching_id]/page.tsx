import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeBranch, normalizeCenter } from "@/lib/types";
import { CenterDetail } from "@/components/coaching/CenterDetail";

export default async function CenterPage({ params }: { params: Promise<{ coaching_id: string }> }) {
  const { coaching_id } = await params; const supabase = await createClient();
  const { data: row, error } = await supabase.from("coaching_centers").select("*").eq("id", coaching_id).single();
  if (error || !row) notFound();
  const center = normalizeCenter(row);
  const [{ data: branchRows }, { data: owner }] = await Promise.all([
    supabase.from("coaching_branches").select("*").eq("coaching_center_id", center.id).order("is_main_branch", { ascending: false }),
    center.owner_id ? supabase.from("profiles").select("id,full_name,email,avatar_url").eq("id", center.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  center.owner = owner;
  return <CenterDetail center={center} branches={(branchRows ?? []).map(normalizeBranch)} />;
}
