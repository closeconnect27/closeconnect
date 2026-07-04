import { notFound } from "next/navigation";
import Link from "next/link";
import { IconStar, IconUsers, IconMapPin } from "@tabler/icons-react";
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
import { CommunityDetailActions } from "@/components/communities/CommunityDetailActions";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { JoinSection } from "@/components/communities/JoinSection";
import { GroupList } from "@/components/communities/GroupList";
import { MemberList } from "@/components/communities/MemberList";
import { PendingRequests } from "@/components/communities/PendingRequests";

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
  const isMember = !!membership;
  const isStaff = membership?.role === "owner" || membership?.role === "moderator";

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

  return (
    <div className="flex-1 pb-10">
      <div className="relative h-40 w-full sm:h-52" style={{ background: visual.bg }}>
        <CategoryImage
          slug={community.category}
          seed={communitySeed(community.id)}
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
            className="rounded-full px-3 py-1 text-[11px] font-bold"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          {extraCats.map((ec) => (
            <span
              key={ec.slug}
              className="rounded-full px-3 py-1 text-[11px] font-bold opacity-80"
              style={{ background: ec.bg, color: ec.light }}
            >
              {ec.label}
            </span>
          ))}
          <span className="rounded-full border border-border2 px-3 py-1 text-[11px] font-bold text-text2">
            {isNative ? "native community" : "external"}
          </span>
        </div>

        <h1 className="font-heading text-[28px] font-extrabold leading-tight">{community.name}</h1>

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
                  : "no ratings yet"}
              </span>
            </>
          )}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text2">
          {community.description}
        </p>

        {isNative && (
          <div className="mt-8 flex flex-col gap-8">
            <JoinSection
              communityId={community.id}
              joinMode={community.join_mode}
              isMember={isMember}
              isLoggedIn={!!user}
              pendingStatus={pendingStatus}
              formFields={formFields}
            />

            <section>
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Groups</h2>
              <GroupList
                communityId={community.id}
                groups={groups}
                isMember={isMember}
                joinedGroupIds={joinedGroupIds}
              />
            </section>

            <section>
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Members</h2>
              <MemberList members={members} />
            </section>

            {isStaff && (
              <section>
                <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">
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

        <CommunityDetailActions
          communityId={community.id}
          kind={community.kind}
          externalLink={community.external_link}
          isLoggedIn={!!user}
        />

        <Link href="/communities" className="mt-8 block text-center text-[13px] text-text3 transition hover:text-text2">
          ← back to communities
        </Link>
      </div>
    </div>
  );
}
