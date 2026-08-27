import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeBranch, normalizeCenter } from "@/lib/types";
import { BranchDetail } from "@/components/coaching/BranchDetail";

export default async function BranchPage({ params }: { params: Promise<{ coaching_id: string; branch_id: string }> }) {
  const { coaching_id, branch_id } = await params; const supabase = await createClient();
  const [{ data: branchRow }, { data: centerRow }] = await Promise.all([
    supabase.from("coaching_branches").select("*").eq("id", branch_id).eq("coaching_center_id", coaching_id).single(),
    supabase.from("coaching_centers").select("*").eq("id", coaching_id).single(),
  ]);
  if (!branchRow || !centerRow) notFound();
  const branch = normalizeBranch(branchRow); const center = normalizeCenter(centerRow);
  const [{ data: address }, { data: manager }] = await Promise.all([
    supabase.from("addresses").select("address_line_1,address_line_2,city,state,pin_code,latitude,longitude,google_place_id,postal_address").eq("branch_id", branch.id).eq("address_type", "BRANCH").maybeSingle(),
    branch.manager_id ? supabase.from("profiles").select("id,full_name,email,avatar_url").eq("id", branch.manager_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  branch.address = address; branch.manager = manager;
  return <BranchDetail branch={branch} center={center} />;
}
