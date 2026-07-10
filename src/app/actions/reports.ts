"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/** Admin-only, explicit check (SPEC.md Section 11) -- RLS (reports_update_admin,
 * 0001) backs this up independently. */
export async function resolveReport(reportId: string, decision: "resolved" | "dismissed") {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Only an admin can review reports" };

  const { error } = await supabase.from("reports").update({ status: decision }).eq("id", reportId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { error: null };
}
