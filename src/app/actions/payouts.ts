"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Marks a batch of paid registrations as forwarded to their organizer --
 * the actual bank transfer/UPI payment still happens outside this app
 * entirely (0065's own "payout tracking, not automation" framing); this is
 * just recording that it happened, so the amount stops showing as owed.
 * Admin client for the write, same reasoning as verifyRazorpayPayment's
 * own admin-client write: this crosses every host's own data, and no RLS
 * policy grants a platform admin that regardless of who owns the row. */
export async function markPayoutsSettled(registrationIds: string[]) {
  const user = await requireUser();
  if (registrationIds.length === 0) return { error: "Nothing selected" };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Only an admin can do this" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("form_responses")
    .update({ payout_status: "paid_out", payout_marked_at: new Date().toISOString() })
    .in("id", registrationIds)
    .eq("payment_status", "paid")
    .eq("payout_status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/admin/payouts");
  return { error: null };
}
