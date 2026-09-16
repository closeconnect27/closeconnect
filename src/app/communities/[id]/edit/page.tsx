import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById } from "@/lib/queries/communities";
import { getCommunityMembership } from "@/lib/queries/membership";
import { EditCommunityForm } from "@/components/communities/EditCommunityForm";

export default async function EditCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  let community;
  try {
    community = await getCommunityById(supabase, id);
  } catch {
    notFound();
  }

  // Page-level gate in addition to the Server Action's own check (SPEC.md
  // Section 11) -- redirect rather than notFound so a non-admin who lands
  // here (e.g. an old bookmark after their role changed) gets a clear
  // reason, not a bare 404 that reads as "this community doesn't exist".
  // Any admin can edit now, not just whoever created it (0108) -- owner_id
  // is still checked as a defensive fallback (see dashboard.ts's comment).
  const membership = await getCommunityMembership(supabase, id, user.id);
  const isStaff = community.owner_id === user.id || membership?.role === "moderator";
  if (!isStaff) {
    redirect(`/communities/${id}`);
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/communities/${id}`}
          className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2"
        >
          ← Back to community
        </Link>
        <h1 className="mb-6 font-heading text-[18px] font-bold leading-tight">Edit community</h1>
        <EditCommunityForm community={community} />
      </div>
    </div>
  );
}
