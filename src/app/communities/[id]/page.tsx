import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { IconStar, IconUsers, IconMapPin, IconPencil, IconChartBar } from "@tabler/icons-react";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById } from "@/lib/queries/communities";
import {
  getCommunityMembership,
  getCommunityGroups,
  getUserGroupMemberships,
  getCommunityFormFields,
  getCommunityMembers,
  getCommunityMemberCount,
  getPendingJoinRequests,
  getMyJoinRequestStatus,
} from "@/lib/queries/membership";
import { getEvents } from "@/lib/queries/events";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import { getMyRating } from "@/lib/queries/ratings";
import { getUnreadCounts } from "@/lib/queries/chat";
import { CommunityDetailActions } from "@/components/communities/CommunityDetailActions";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { JoinSection } from "@/components/communities/JoinSection";
import { GroupList } from "@/components/communities/GroupList";
import { CreateGroupForm } from "@/components/communities/CreateGroupForm";
import { MemberList } from "@/components/communities/MemberList";
import { MembersVisibilityToggle } from "@/components/communities/MembersVisibilityToggle";
import { MemberCountVisibilityToggle } from "@/components/communities/MemberCountVisibilityToggle";
import { PendingRequests } from "@/components/communities/PendingRequests";
import { RatingSection } from "@/components/communities/RatingSection";
import { ClaimSection } from "@/components/communities/ClaimSection";
import { CommunityTabs } from "@/components/communities/CommunityTabs";
import { EventCard } from "@/components/events/EventCard";
import { RichTextView } from "@/components/ui/RichTextView";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { FoundingBadge } from "@/components/ui/FoundingBadge";
import { FoundingToggle } from "@/components/ui/FoundingToggle";
import { setCommunityFounding } from "@/app/actions/admin";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCalendarEvent } from "@tabler/icons-react";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: community } = await supabase.from("communities").select("name, description, city, category").eq("id", id).single();
  if (!community) return {};

  const title = `${community.name}${community.city ? ` in ${community.city}` : ""}`;
  const description = community.description.slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

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
  const { data: viewerProfile } = user
    ? await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
    : { data: null };
  const isAdmin = !!viewerProfile?.is_admin;

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
  // Only the groups the viewer has actually joined can have a meaningful
  // unread count for them -- get_group_unread_count itself would just
  // return every message ever sent for a group they've never opened, which
  // isn't "unread" so much as "never seen at all."
  const unreadCounts =
    user && joinedGroupIds.size > 0 ? await getUnreadCounts(supabase, [...joinedGroupIds]) : {};

  const formFields =
    isNative && community.join_mode === "request" ? await getCommunityFormFields(supabase, id) : [];

  const pendingStatus =
    isNative && user && !isMember ? await getMyJoinRequestStatus(supabase, id, user.id) : null;

  const members = isNative ? await getCommunityMembers(supabase, id) : [];
  const memberCount = isNative ? await getCommunityMemberCount(supabase, id) : 0;
  const isFull = community.member_limit != null && community.member_count >= community.member_limit;
  const pendingRequests = isNative && isStaff ? await getPendingJoinRequests(supabase, id) : [];
  const myRating = isNative && user && !isOwner ? await getMyRating(supabase, id, user.id) : null;
  // includePast so a community with only past events (or none upcoming)
  // still shows its history in the Events tab, not just an empty state --
  // getEvents already excludes drafts (null event_date) unconditionally.
  const hostedEvents = isMember ? await getEvents(supabase, { communityId: id, includePast: true }) : [];

  return (
    <div className="flex-1 pb-10">
      <PageViewTracker targetType="community" targetId={community.id} viewerId={user?.id ?? null} />
      <div className="relative h-40 w-full sm:h-52" style={{ background: visual.bg }}>
        <CategoryImage
          slug={community.category}
          seed={communitySeed(community.id)}
          unsplashImageUrl={community.unsplash_image_url}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
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
          <h1 className="flex items-center gap-1.5 font-heading text-[18px] font-bold leading-tight">
            {community.name}
            {community.is_verified && <VerifiedBadge />}
          </h1>
          {community.is_founding && <FoundingBadge />}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isOwner && (
            <Link href={`/communities/${community.id}/edit`} className="btn-secondary px-4 py-2 text-[13px]">
              <IconPencil size={14} />
              Edit
            </Link>
          )}
          {isStaff && (
            <Link href={`/communities/${community.id}/analytics`} className="btn-secondary px-4 py-2 text-[13px]">
              <IconChartBar size={14} />
              Analytics
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
              {(community.member_count_visible || isStaff) && (
                <span className="flex items-center gap-1.5">
                  <IconUsers size={14} className="text-text3" />
                  {community.member_count}
                  {community.member_limit != null && ` / ${community.member_limit}`} members
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <IconStar size={14} className="text-text3" />
                {community.avg_rating > 0
                  ? `${community.avg_rating.toFixed(1)} (${community.rating_count})`
                  : "No ratings yet"}
              </span>
            </>
          )}
        </div>

        {/* Pre-join / non-native: description shown plain here. Once a
            member of a native community, it moves into the About tab
            below instead, alongside the rest of the community's details. */}
        {(!isNative || !isMember) && (
          <div className="mt-4 text-[15px] leading-relaxed">
            <RichTextView content={community.description_content} plainFallback={community.description} />
          </div>
        )}

        {isNative && (
          <div className="mt-8 flex flex-col gap-8">
            <div className="flex flex-wrap gap-3">
              <JoinSection
                communityId={community.id}
                joinMode={community.join_mode}
                isMember={isMember}
                isOwner={isOwner}
                isLoggedIn={!!user}
                isFull={isFull}
                pendingStatus={pendingStatus}
                formFields={formFields}
              />
              <RatingSection communityId={community.id} isLoggedIn={!!user} isOwner={isOwner} isMember={isMember} myRating={myRating} />
            </div>

            {isMember ? (
              <CommunityTabs
                groups={
                  <section>
                    <GroupList
                      communityId={community.id}
                      groups={groups}
                      isMember={isMember}
                      joinedGroupIds={joinedGroupIds}
                      unreadCounts={unreadCounts}
                      currentUserId={user?.id ?? null}
                    />
                    {isStaff && (
                      <div className="mt-3">
                        <CreateGroupForm communityId={community.id} />
                      </div>
                    )}
                  </section>
                }
                about={
                  <section className="flex flex-col gap-4">
                    <RichTextView content={community.description_content} plainFallback={community.description} />
                    <div className="flex flex-col gap-2 rounded-card border border-border bg-bg2 p-4 text-[13px] text-text2">
                      <DetailRow label="Type" value={capitalize(community.community_type)} />
                      <DetailRow label="Who can join" value={community.join_mode === "open" ? "Open" : "Request to join"} />
                      {community.city && <DetailRow label="City" value={community.city} />}
                      {community.member_limit != null && (
                        <DetailRow label="Member limit" value={`${community.member_count} / ${community.member_limit}`} />
                      )}
                    </div>
                    {isOwner && <MemberCountVisibilityToggle communityId={community.id} visible={community.member_count_visible} />}
                    {isAdmin && (
                      <FoundingToggle founding={community.is_founding} onToggle={setCommunityFounding.bind(null, community.id)} />
                    )}
                  </section>
                }
                members={
                  <section className="flex flex-col gap-8">
                    <div>
                      {isOwner && (
                        <div className="mb-3">
                          <MembersVisibilityToggle communityId={community.id} visible={community.members_list_visible} />
                        </div>
                      )}
                      <MemberList
                        communityId={community.id}
                        members={members}
                        totalCount={memberCount}
                        ownerId={community.owner_id}
                        isStaff={isStaff}
                        isOwner={isOwner}
                        membersListVisible={community.members_list_visible}
                        currentUserId={user?.id ?? null}
                      />
                    </div>

                    {isStaff && pendingRequests.length > 0 && (
                      <div>
                        <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
                          Pending requests
                        </h2>
                        <PendingRequests
                          communityId={community.id}
                          requests={pendingRequests}
                          formFields={formFields}
                        />
                      </div>
                    )}
                  </section>
                }
                events={
                  <section>
                    {hostedEvents.length === 0 ? (
                      <EmptyState icon={IconCalendarEvent} title="No events yet" description="Nothing hosted under this community yet." compact />
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {hostedEvents.map((e) => (
                          <EventCard key={e.id} event={e} />
                        ))}
                      </div>
                    )}
                  </section>
                }
              />
            ) : (
              <p className="rounded-card border border-border bg-bg2 px-4 py-3 text-[13px] text-text3">
                Join this community to see its groups and members.
              </p>
            )}
          </div>
        )}

        {!isNative && (
          <div className="mt-8">
            <ClaimSection communityId={community.id} claimStatus={community.claim_status} isLoggedIn={!!user} email={user?.email} />
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text3">{label}</span>
      <span className="font-medium text-text">{value}</span>
    </div>
  );
}
