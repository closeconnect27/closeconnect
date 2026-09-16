import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  IconStar,
  IconUsers,
  IconMapPin,
  IconPencil,
  IconChartBar,
  IconBrandInstagram,
  IconBrandFacebook,
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconPhone,
} from "@tabler/icons-react";
import { safeSocialHref } from "@/lib/validators/links";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById, communitySlugOrId, communityLookupColumn } from "@/lib/queries/communities";
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
import { getMyRating } from "@/lib/queries/ratings";
import { getUnreadCounts } from "@/lib/queries/chat";
import { CommunityDetailActions } from "@/components/communities/CommunityDetailActions";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { JoinSection } from "@/components/communities/JoinSection";
import { GroupList } from "@/components/communities/GroupList";
import { CreateGroupForm } from "@/components/communities/CreateGroupForm";
import { MemberList } from "@/components/communities/MemberList";
import { MembersVisibilityToggle } from "@/components/communities/MembersVisibilityToggle";
import { MemberCountVisibilityToggle } from "@/components/communities/MemberCountVisibilityToggle";
import { PendingRequests } from "@/components/communities/PendingRequests";
import { RatingSection } from "@/components/communities/RatingSection";
import { ClaimSection } from "@/components/communities/ClaimSection";
import { LeaveCommunitySection } from "@/components/communities/LeaveCommunitySection";
import { ReachOutButton } from "@/components/communities/ReachOutButton";
import { DmInboxSection } from "@/components/communities/DmInboxSection";
import { getMyDmThread, getCommunityDmThreads, getDmThreadMessages } from "@/lib/queries/dm";
import { getDmReadTimestamps, isThreadUnread } from "@/lib/queries/dmReads";
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
  const { data: community } = await supabase
    .from("communities")
    .select("name, description, city, category")
    .eq(communityLookupColumn(id), id)
    .single();
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
  // Every query below this point needs the real uuid (community_members,
  // community_groups, etc. all FK against it) -- id itself may be a slug
  // now, only ever safe to pass to getCommunityById/generateMetadata's own
  // dual-lookup queries above, never anything downstream of the fetch.
  const communityId = community.id;
  const communityHref = communitySlugOrId(community);

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

  const membership = isNative && user ? await getCommunityMembership(supabase, communityId, user.id) : null;
  const isOwner = !!user && community.owner_id === user.id;
  // communities.owner_id is authoritative for ownership, not
  // community_members.role -- that row is separate and mutable, and can
  // drift from it (e.g. a removed-then-rejoined membership always defaults
  // to role='member'). Falling back to owner_id here means the actual owner
  // never silently loses staff access to, or membership status in, their
  // own community even if that row is ever wrong or missing.
  const isMember = !!membership || isOwner;
  const isStaff = isOwner || membership?.role === "owner" || membership?.role === "moderator";

  const groups = isNative ? await getCommunityGroups(supabase, communityId) : [];
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
    isNative && community.join_mode === "request" ? await getCommunityFormFields(supabase, communityId) : [];

  const pendingStatus =
    isNative && user && !isMember ? await getMyJoinRequestStatus(supabase, communityId, user.id) : null;

  const members = isNative ? await getCommunityMembers(supabase, communityId) : [];
  const memberCount = isNative ? await getCommunityMemberCount(supabase, communityId) : 0;
  const isFull = community.member_limit != null && community.member_count >= community.member_limit;
  const pendingRequests = isNative && isStaff ? await getPendingJoinRequests(supabase, communityId) : [];
  const myRating = isNative && user && !isOwner ? await getMyRating(supabase, communityId, user.id) : null;
  // includePast so a community with only past events (or none upcoming)
  // still shows its history in the Events tab, not just an empty state --
  // getEvents already excludes drafts (null event_date) unconditionally.
  // Public for native communities (even pre-join) and for claimed-but-not-
  // yet-native external ones -- a visitor deciding whether to join/trust a
  // community should be able to see what it actually hosts without
  // joining first. isMember also fetches it (redundantly, when isNative is
  // already true) purely so the condition still reads correctly if native
  // membership visibility rules ever diverge from this.
  const canSeePublicEvents = isNative || community.claim_status === "approved";
  const hostedEvents =
    isMember || canSeePublicEvents ? await getEvents(supabase, { communityId, includePast: true }) : [];

  // "Reach out to admin": a member's own thread (ReachOutButton), or --
  // for the owner/moderators -- every member thread that's ever been
  // opened (DmInboxSection). Never both for the same viewer: isStaff and
  // "isMember && !isStaff" are mutually exclusive by construction.
  const myDm = isNative && isMember && !isStaff && user ? await getMyDmThread(supabase, communityId, user.id) : null;
  const dmThreads = isNative && isStaff ? await getCommunityDmThreads(supabase, communityId) : [];
  const dmMessagesByThread =
    dmThreads.length > 0
      ? Object.fromEntries(await Promise.all(dmThreads.map(async (t) => [t.id, await getDmThreadMessages(supabase, t.id)] as const)))
      : {};
  // "Unread" badge source -- see isThreadUnread's comment (0074). Staff
  // reads one marker per member thread; a member reads just their own.
  const dmReadTimestamps =
    user && (dmThreads.length > 0 || myDm?.threadId)
      ? await getDmReadTimestamps(
          supabase,
          user.id,
          "community",
          isStaff ? dmThreads.map((t) => t.id) : myDm?.threadId ? [myDm.threadId] : [],
        )
      : new Map<string, string>();
  const myDmHasUnread =
    !!myDm?.threadId &&
    !!myDm.messages.length &&
    isThreadUnread(
      myDm.messages[myDm.messages.length - 1].created_at,
      myDm.messages[myDm.messages.length - 1].sender_id,
      user!.id,
      dmReadTimestamps.get(myDm.threadId),
    );

  return (
    <div className="flex-1 pb-10">
      <PageViewTracker targetType="community" targetId={community.id} viewerId={user?.id ?? null} />
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
        </div>

        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-1.5 font-heading text-[18px] font-bold leading-tight">
            {community.name}
            {community.is_verified && <VerifiedBadge />}
          </h1>
          {community.is_founding && <FoundingBadge />}
        </div>

        {community.owner && (
          <p className="mt-1 text-[13px] text-text2">
            Owned by{" "}
            <Link href={`/profile/${community.owner.id}`} className="font-medium text-text hover:text-green hover:underline">
              {community.owner.display_name}
            </Link>
          </p>
        )}

        {/* Join/request action surfaces immediately below the header --
            the decision a visitor is here to make -- rather than after
            the description and meta row. Visible pre-join since it's the
            whole point of a non-member's visit here. Unconditional (0083)
            -- every community is native from creation now, claimed or not,
            so an unclaimed listing gets the same live Join/chat as an
            owned one instead of waiting for a claim first. */}
        <div className="mt-4 flex flex-wrap gap-3">
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
          <RatingSection communityId={community.id} isLoggedIn={!!user} isOwner={isStaff} isMember={isMember} myRating={myRating} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isStaff && (
            <Link href={`/communities/${communityHref}/edit`} className="btn-secondary px-4 py-2 text-[13px]">
              <IconPencil size={14} />
              Edit
            </Link>
          )}
          {/* Native only -- every stat on the analytics page (join
              requests, member growth, active members) is a native
              community_members/join_mode concept that never populates
              for an external listing, even one a claim gave a real
              owner_id to. */}
          {isNative && isStaff && (
            <Link href={`/communities/${communityHref}/analytics`} className="btn-secondary px-4 py-2 text-[13px]">
              <IconChartBar size={14} />
              Analytics
            </Link>
          )}
          {/* Staff (owner OR moderator) never gets "reach out to admin" --
              they already are the admin -- and get the inbox instead. */}
          {isNative && isStaff && (
            <DmInboxSection
              communityId={community.id}
              threads={dmThreads}
              messagesByThread={dmMessagesByThread}
              currentUserId={user!.id}
              readTimestamps={dmReadTimestamps}
            />
          )}
          {isMember && !isStaff && (
            <ReachOutButton
              communityId={community.id}
              communityName={community.name}
              threadId={myDm?.threadId ?? null}
              initialMessages={myDm?.messages ?? []}
              currentUserId={user!.id}
              hasUnread={myDmHasUnread}
            />
          )}
          {isMember && <CopyLinkButton path={`/communities/${communityHref}`} />}
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

        {(community.whatsapp_url || community.instagram_url || community.facebook_url || community.linkedin_url || community.phone) && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {community.whatsapp_url && (
              <a
                href={safeSocialHref("whatsapp", community.whatsapp_url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex items-center gap-1.5 text-[13px] font-medium transition hover:brightness-110"
                style={{ color: "#25D366" }}
              >
                <IconBrandWhatsapp size={26} />
                WhatsApp
              </a>
            )}
            {community.instagram_url && (
              <a
                href={safeSocialHref("instagram", community.instagram_url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex items-center gap-1.5 text-[13px] font-medium transition hover:brightness-110"
                style={{ color: "#E1306C" }}
              >
                <IconBrandInstagram size={26} />
                Instagram
              </a>
            )}
            {community.facebook_url && (
              <a
                href={safeSocialHref("facebook", community.facebook_url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="transition hover:brightness-110"
                style={{ color: "#1877F2" }}
              >
                <IconBrandFacebook size={18} />
              </a>
            )}
            {community.linkedin_url && (
              <a
                href={safeSocialHref("linkedin", community.linkedin_url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="transition hover:brightness-110"
                style={{ color: "#0A66C2" }}
              >
                <IconBrandLinkedin size={18} />
              </a>
            )}
            {community.phone && (
              <a href={`tel:${community.phone}`} aria-label="Phone" className="flex items-center gap-1.5 text-[13px] font-medium text-green transition hover:brightness-110">
                <IconPhone size={16} />
                {community.phone}
              </a>
            )}
          </div>
        )}

        {/* Pre-join / non-native: description shown plain here. Once a
            member of a native community, it moves into the About tab
            below instead, alongside the rest of the community's details. */}
        {(!isNative || !isMember) && (
          <div className="mt-4 text-[15px] leading-relaxed">
            <RichTextView content={community.description_content} plainFallback={community.description} />
          </div>
        )}

        {/* Public events: shown here directly (not gated behind the
            member-only Tabs below) for anyone who can see events per
            canSeePublicEvents but isn't already getting them via the
            native member Tabs' own events slot -- i.e. every case except
            "native and already a member." */}
        {canSeePublicEvents && !(isNative && isMember) && (
          <div className="mt-8">
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Events</h2>
            {hostedEvents.length === 0 ? (
              <EmptyState icon={IconCalendarEvent} title="No events yet" description="Nothing hosted under this community yet." compact />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {hostedEvents.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>
        )}

        {isNative && (
          <div className="mt-8 flex flex-col gap-8">
            {isMember ? (
              <CommunityTabs
                groups={
                  <section>
                    <GroupList
                      communityId={community.id}
                      communityHref={communityHref}
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
                      <DetailRow label="Who can join" value={community.join_mode === "open" ? "Open" : "Request to join"} />
                      {community.city && <DetailRow label="City" value={community.city} />}
                      {community.member_limit != null && (
                        <DetailRow label="Member limit" value={`${community.member_count} / ${community.member_limit}`} />
                      )}
                    </div>
                    {isAdmin && (
                      <FoundingToggle founding={community.is_founding} onToggle={setCommunityFounding.bind(null, community.id)} />
                    )}
                  </section>
                }
                members={
                  <section className="flex flex-col gap-8">
                    <div>
                      {isOwner && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          <MembersVisibilityToggle communityId={community.id} visible={community.members_list_visible} />
                          <MemberCountVisibilityToggle communityId={community.id} visible={community.member_count_visible} />
                        </div>
                      )}
                      <MemberList
                        communityId={community.id}
                        members={members}
                        totalCount={memberCount}
                        ownerId={community.owner_id}
                        isStaff={isStaff}
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
                Join this community to see its circles and members.
              </p>
            )}
          </div>
        )}

        {/* Gated on owner_id, not kind (0083) -- kind is always 'native'
            now, so owner_id/claim_status alone say whether this community
            still needs a real owner. ClaimSection itself already no-ops
            once claim_status is 'approved'; this just covers the
            still-pending/never-submitted cases without depending on kind. */}
        {!community.owner_id && (
          <div className="mt-8">
            <ClaimSection communityId={community.id} claimStatus={community.claim_status} isLoggedIn={!!user} email={user?.email} />
          </div>
        )}

        <CommunityDetailActions communityId={community.id} isLoggedIn={!!user} />

        {isMember && (
          <LeaveCommunitySection
            communityId={community.id}
            communityName={community.name}
            isOwner={isOwner}
            otherMembers={members
              .filter((m) => m.user_id !== user?.id)
              .map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name ?? "Member" }))}
          />
        )}

        <Link href="/communities" className="mt-8 block text-center text-[13px] text-text3 transition hover:text-text2">
          ← Back to communities
        </Link>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text3">{label}</span>
      <span className="font-medium text-text">{value}</span>
    </div>
  );
}
