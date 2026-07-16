"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

// Loose on purpose -- real UPI VPAs vary more than a tight regex would
// tolerate (numeric handles, bank-specific suffixes); this only catches
// "clearly not a UPI ID" typos (no @, no handle), not a full validator.
const UPI_ID_PATTERN = /^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

export async function updateHostPaymentDetails(input: { upi_id: string; qr_image_url: string | null }) {
  const user = await requireUser();

  const upiId = input.upi_id.trim();
  if (upiId && !UPI_ID_PATTERN.test(upiId)) {
    return { error: "That doesn't look like a valid UPI ID (e.g. yourname@upi)" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("host_payment_details").upsert({
    id: user.id,
    upi_id: upiId || null,
    qr_image_url: input.qr_image_url,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidatePath("/host/dashboard");
  return { error: null };
}
