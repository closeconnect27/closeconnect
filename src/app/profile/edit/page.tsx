import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getProfileDetails } from "@/lib/queries/profileDetails";
import { EditProfileForm } from "@/components/profile/EditProfileForm";

export default async function EditProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Always resolves for the caller's own id -- profile_details_select
  // (0033) grants `id = auth.uid()` unconditionally regardless of
  // visibility, and every profile has had a row since signup (or the
  // migration 0033 backfill) either way.
  const details = await getProfileDetails(supabase, user.id);
  if (!details) {
    throw new Error("Profile details missing for the signed-in user -- this should never happen");
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <Link href="/profile" className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2">
          ← Back to profile
        </Link>
        <h1 className="mb-6 font-heading text-[18px] font-bold leading-tight">Edit profile</h1>
        <EditProfileForm details={details} />
      </div>
    </div>
  );
}
