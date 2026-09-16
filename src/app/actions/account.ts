"use server";

import { requireUser } from "@/lib/supabase/auth";
import { deleteAccountById } from "@/lib/accountDeletion";

// Google Play (and equivalent app-store) policy requires account deletion
// to be self-service, not just a support-email request. See
// deleteAccountById's own comment for why this anonymizes in place instead
// of hard-deleting the row.
export async function deleteMyAccount() {
  const user = await requireUser();
  return deleteAccountById(user.id);
}
