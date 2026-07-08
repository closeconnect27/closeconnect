import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getProfileDetails, getPublicProfileBasic } from "@/lib/queries/profileDetails";
import { getMyVerificationRequestStatus } from "@/lib/queries/verification";
import { EditProfileForm } from "@/components/profile/EditProfileForm";

export default async function EditProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Both always resolve for the caller's own id: profiles_select_public is
  // unconditional (bio/profile_visibility, 0035), and
  // profile_details_select grants `id = auth.uid()` unconditionally too
  // (0035) -- every profile has had a details row since signup or the
  // 0033 backfill.
  const [basic, details, verificationStatus] = await Promise.all([
    getPublicProfileBasic(supabase, user.id),
    getProfileDetails(supabase, user.id),
    getMyVerificationRequestStatus(supabase, "organizer", user.id, user.id),
  ]);
  if (!basic || !details) {
    throw new Error("Profile missing for the signed-in user -- this should never happen");
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <Link href="/profile" className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2">
          ← Back to profile
        </Link>
        <h1 className="mb-6 font-heading text-[18px] font-bold leading-tight">Edit profile</h1>
        <EditProfileForm basic={basic} details={details} verificationStatus={verificationStatus} />
      </div>
    </div>
  );
}
