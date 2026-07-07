import { notFound } from "next/navigation";
import Link from "next/link";
import { IconStar, IconUsers, IconMapPin, IconPencil } from "@tabler/icons-react";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById } from "@/lib/queries/communities";
import {
  getCommunityMembership,
  getCommunityGroups,
  getUserGroupMemberships,
  getCommunityFormFields,
  getCommunityMembers,
  getPendingJoinRequests,
  getMyJoinRequestStatus,
} from "@/lib/queries/membership";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import { getMyRating } from "@/lib/queries/ratings";
import { CommunityDetailActions } from "@/components/communities/CommunityDetailActions";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { JoinSection } from "@/components/communities/JoinSection";
import { GroupList } from "@/components/communities/GroupList";
import { CreateGroupForm } from "@/components/communities/CreateGroupForm";
import { MemberList } from "@/components/communities/MemberList";
import { PendingRequests } from "@/components/communities/PendingRequests";
import { RatingSection } from "@/components/communities/RatingSection";
import { ClaimSection } from "@/components/communities/ClaimSection";
import { Linkify } from "@/components/ui/Linkify";

export default async function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let community;
  try {
    community = await getCommunityById(supabase, id);
  } catch {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const visual = getCategoryVisual(community.category);
  const extraCats = (community.extra_categories ?? []).map(getCategoryVisual);

  const isNative = community.kind === "native";

  const membership = isNative && user ? await getCommunityMembership(supabase, id, user.id) : null;
  const isOwner = !!user && community.owner_id === user.id;
  // communities.owner_id is authoritative for ownership, not
  // community_members.role -- that row is separate and mutable, and can
  // drift from it (e.g. a removed-then-rejoined membership always defaults
  // to role='member'). Falling back to owner_id here means the actual owner
  // never silently loses staff access to, or membership status in, their
  // own community even if that row is ever wrong or missing.
  const isMember = !!membership || isOwner;
  const isStaff = isOwner || membership?.role === "owner" || membership?.role === "moderator";

  const groups = isNative ? await getCommunityGroups(supabase, id) : [];
  const joinedGroupIds =
    isNative && user
      ? await getUserGroupMemberships(supabase, user.id, groups.map((g) => g.id))
      : new Set<string>();

  const formFields =
    isNative && community.join_mode === "request" ? await getCommunityFormFields(supabase, id) : [];

  const pendingStatus =
    isNative && user && !isMember ? await getMyJoinRequestStatus(supabase, id, user.id) : null;

  const members = isNative ? await getCommunityMembers(supabase, id) : [];
  const pendingRequests = isNative && isStaff ? await getPendingJoinRequests(supabase, id) : [];
  const myRating = isNative && user && !isOwner ? await getMyRating(supabase, id, user.id) : null;

  return (
    <div className="flex-1 pb-10">
      <PageViewTracker targetType="community" targetId={community.id} viewerId={user?.id ?? null} />
      <div className="relative h-40 w-full sm:h-52" style={{ background: visual.bg }}>
        {community.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
          <img src={community.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CategoryImage
            slug={community.category}
            seed={communitySeed(community.id)}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <div className="mb-3 flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1 font-mono text-[11px] font-semibold"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          {extraCats.map((ec) => (
            <span
              key={ec.slug}
              className="rounded-full px-3 py-1 font-mono text-[11px] font-semibold opacity-80"
              style={{ background: ec.bg, color: ec.light }}
            >
              {ec.label}
            </span>
          ))}
          <span className="rounded-full border border-border2 px-3 py-1 font-mono text-[11px] font-medium text-text2">
            {isNative ? "Native community" : "External"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {community.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
            <img
              src={community.logo_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-border bg-bg2 object-cover"
            />
          )}
          <h1 className="font-heading text-[18px] font-bold leading-tight">{community.name}</h1>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isOwner && (
            <Link href={`/communities/${community.id}/edit`} className="btn-secondary px-4 py-2 text-[13px]">
              <IconPencil size={14} />
              Edit
            </Link>
          )}
          {isMember && <CopyLinkButton path={`/communities/${community.id}`} />}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px] font-medium text-text2">
          {community.city && (
            <span className="flex items-center gap-1.5">
              <IconMapPin size={14} className="text-text3" />
              {community.city}
            </span>
          )}
          {isNative && (
            <>
              <span className="flex items-center gap-1.5">
                <IconUsers size={14} className="text-text3" />
                {community.member_count} members
              </span>
              <span className="flex items-center gap-1.5">
                <IconStar size={14} className="text-text3" />
                {community.avg_rating > 0
                  ? `${community.avg_rating.toFixed(1)} (${community.rating_count})`
                  : "No ratings yet"}
              </span>
            </>
          )}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text2">
          <Linkify text={community.description} />
        </p>

        {isNative && (
          <div className="mt-8 flex flex-col gap-8">
            <div className="flex flex-wrap gap-3">
              <JoinSection
                communityId={community.id}
                joinMode={community.join_mode}
                isMember={isMember}
                isOwner={isOwner}
                isLoggedIn={!!user}
                pendingStatus={pendingStatus}
                formFields={formFields}
              />
              <RatingSection communityId={community.id} isLoggedIn={!!user} isOwner={isOwner} isMember={isMember} myRating={myRating} />
            </div>

            <section>
              <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Groups</h2>
              <GroupList
                communityId={community.id}
                groups={groups}
                isMember={isMember}
                joinedGroupIds={joinedGroupIds}
              />
              {isStaff && (
                <div className="mt-3">
                  <CreateGroupForm communityId={community.id} />
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Members</h2>
              <MemberList
                communityId={community.id}
                members={members}
                ownerId={community.owner_id}
                isStaff={isStaff}
                currentUserId={user?.id ?? null}
              />
            </section>

            {isStaff && (
              <section>
                <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
                  Pending requests
                </h2>
                <PendingRequests
                  communityId={community.id}
                  requests={pendingRequests}
                  formFields={formFields}
                />
              </section>
            )}
          </div>
        )}

        {!isNative && (
          <div className="mt-8">
            <ClaimSection communityId={community.id} claimStatus={community.claim_status} isLoggedIn={!!user} />
          </div>
        )}

        <CommunityDetailActions
          communityId={community.id}
          kind={community.kind}
          externalLink={community.external_link}
          isLoggedIn={!!user}
        />

        <Link href="/communities" className="mt-8 block text-center text-[13px] text-text3 transition hover:text-text2">
          ← Back to communities
        </Link>
      </div>
    </div>
  );
}
