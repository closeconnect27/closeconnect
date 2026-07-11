import { notFound } from "next/navigation";
import Link from "next/link";
import {
  IconLock,
  IconUsers,
  IconCalendarEvent,
  IconBriefcase,
  IconSchool,
  IconBuilding,
  IconBrandLinkedin,
  IconBrandGithub,
  IconBrandInstagram,
  IconPencil,
  IconStar,
  IconMapPin,
  IconUsersGroup,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import {
  getProfileDetails,
  getPublicProfileBasic,
  getCommunitiesJoinedPublic,
  getEventsAttendedPublic,
  getFollowRequestStatus,
  getIsFollowing,
} from "@/lib/queries/profileDetails";
import { getOrganizerStats } from "@/lib/queries/verification";
import { getCategoryVisual, getCategory } from "@/lib/categories";
import { safeSocialHref } from "@/lib/validators/links";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { FoundingBadge } from "@/components/ui/FoundingBadge";
import { FoundingToggle } from "@/components/ui/FoundingToggle";
import { setHostFounding } from "@/app/actions/admin";
import { RequestToFollowButton } from "@/components/profile/RequestToFollowButton";
import { FollowButton } from "@/components/profile/FollowButton";
import { RichTextView } from "@/components/ui/RichTextView";

// bio/profile_visibility come from `basic` (profiles, always public, 0035)
// -- always resolves for any real profile id and shows regardless of
// visibility. `details` (profile_details) coming back null is the signal
// that the *rest* of the profile isn't visible to this viewer; which
// message to show for that depends on basic.profile_visibility, which is
// itself always readable (a viewer needs to know a profile is private in
// order to see a "Request to follow" button, same as Instagram's lock icon).
export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const basic = await getPublicProfileBasic(supabase, id);
  if (!basic) notFound();

  const [details, stats, isFollowing] = await Promise.all([
    getProfileDetails(supabase, id),
    getOrganizerStats(supabase, id),
    getIsFollowing(supabase, id, viewer?.id ?? null),
  ]);
  const isOwner = viewer?.id === id;
  const { data: viewerProfile } = viewer
    ? await supabase.from("profiles").select("is_admin").eq("id", viewer.id).single()
    : { data: null };
  const isAdmin = !!viewerProfile?.is_admin;

  const initial = basic.display_name.charAt(0).toUpperCase();

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-6">
          {basic.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
            <img src={basic.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-tint text-[20px] font-bold text-green">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 truncate font-heading text-[16px] font-bold">
              {basic.display_name}
              {basic.is_verified && <VerifiedBadge />}
              {basic.is_founding_host && <FoundingBadge />}
            </h1>
            <span className="flex items-center gap-1 text-[13px] text-text3">
              {basic.host_rating_count > 0 ? (
                <>
                  <IconStar size={13} className="fill-green text-green" />
                  {basic.host_rating.toFixed(1)} host rating
                </>
              ) : (
                "New host"
              )}
            </span>
          </div>
          {isOwner && (
            <Link href="/profile/edit" className="btn-secondary shrink-0 px-4 py-2 text-[13px]">
              <IconPencil size={14} />
              <span className="hidden sm:inline">Edit profile</span>
            </Link>
          )}
          {/* Not just "visibility !== private" -- a members_only profile the
              viewer doesn't share a community with is still blocked (details
              null) even though it isn't private, and profile_follows_insert_own
              (0061) only allows an instant follow when the RLS visibility
              check actually passes. `details` non-null is exactly that
              check already evaluated server-side, so gating on it here
              keeps this button from ever attempting an insert RLS would
              reject. */}
          {!isOwner && viewer && basic.profile_visibility !== "private" && details && (
            <FollowButton targetId={id} initiallyFollowing={isFollowing} />
          )}
        </div>

        {isAdmin && (
          <div className="mt-3">
            <FoundingToggle founding={basic.is_founding_host} onToggle={setHostFounding.bind(null, basic.id)} />
          </div>
        )}

        {/* Always visible regardless of profile_visibility (0035) -- bio
            lives on `profiles`, not the gated profile_details. */}
        {(basic.bio_content || basic.bio) && (
          <div className="mt-6 text-[14px] leading-relaxed">
            <RichTextView content={basic.bio_content} plainFallback={basic.bio} />
          </div>
        )}

        {/* Organizer stats: computed live (getOrganizerStats), not stored --
            shown whenever there's anything to show, same as bio, regardless
            of profile_visibility (these are aggregate counts, not the
            gated detail fields). Hidden entirely for a non-organizer so an
            ordinary member's profile doesn't show a row of zeros. */}
        {(stats.communitiesCreated > 0 || stats.eventsHosted > 0) && (
          <div className="mt-4 flex gap-3">
            <StatCard icon={IconUsers} label="Communities created" value={stats.communitiesCreated} />
            <StatCard icon={IconCalendarEvent} label="Events hosted" value={stats.eventsHosted} />
            <StatCard icon={IconUsersGroup} label="Members managed" value={stats.totalMembersManaged} />
          </div>
        )}

        {!details && !isOwner ? (
          <RestrictedProfileNotice
            visibility={basic.profile_visibility}
            hasViewer={!!viewer}
            targetId={id}
            supabase={supabase}
            viewerId={viewer?.id ?? null}
          />
        ) : details ? (
          <ProfileDetailSections details={details} profileId={id} supabase={supabase} />
        ) : null}
      </div>
    </div>
  );
}

async function RestrictedProfileNotice({
  visibility,
  hasViewer,
  targetId,
  viewerId,
  supabase,
}: {
  visibility: "public" | "members_only" | "private";
  hasViewer: boolean;
  targetId: string;
  viewerId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (visibility === "members_only" && !hasViewer) {
    return (
      <div className="mt-8">
        <EmptyState icon={IconLock} title="Sign in to view this profile" compact />
      </div>
    );
  }

  if (visibility === "members_only") {
    // has_accepted_follow_request(id) unlocks profile_details visibility
    // regardless of profile_visibility (see profile_details_select RLS,
    // 0035/0036) -- so a members_only profile the viewer doesn't share a
    // community with is still reachable through the same request/approve
    // flow private profiles use, not a permanent dead end.
    const requestStatus = await getFollowRequestStatus(supabase, targetId, viewerId!);
    return (
      <div className="mt-8">
        <EmptyState
          icon={IconUsers}
          title="Only shared community members can view this profile"
          compact
        />
        <div className="mt-4 flex justify-center">
          <RequestToFollowButton targetId={targetId} initialStatus={requestStatus} />
        </div>
      </div>
    );
  }

  // private
  if (!hasViewer) {
    return (
      <div className="mt-8">
        <EmptyState icon={IconLock} title="Sign in to request to view this profile" compact />
      </div>
    );
  }

  const requestStatus = await getFollowRequestStatus(supabase, targetId, viewerId);

  return (
    <div className="mt-8">
      <EmptyState icon={IconLock} title="This profile is private" compact />
      <div className="mt-4 flex justify-center">
        <RequestToFollowButton targetId={targetId} initialStatus={requestStatus} />
      </div>
    </div>
  );
}

async function ProfileDetailSections({
  details,
  profileId,
  supabase,
}: {
  details: NonNullable<Awaited<ReturnType<typeof getProfileDetails>>>;
  profileId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [communities, events] = await Promise.all([
    getCommunitiesJoinedPublic(supabase, profileId),
    getEventsAttendedPublic(supabase, profileId),
  ]);

  const socialLinks = [
    { platform: "linkedin" as const, url: details.linkedin_url, icon: IconBrandLinkedin, label: "LinkedIn" },
    { platform: "github" as const, url: details.github_url, icon: IconBrandGithub, label: "GitHub" },
    { platform: "instagram" as const, url: details.instagram_url, icon: IconBrandInstagram, label: "Instagram" },
  ].filter((l) => l.url);

  return (
    <>
      {(details.occupation || details.company || details.college) && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-text3">
          {details.occupation && (
            <span className="flex items-center gap-1.5">
              <IconBriefcase size={14} />
              {details.occupation}
              {details.company && ` at ${details.company}`}
            </span>
          )}
          {!details.occupation && details.company && (
            <span className="flex items-center gap-1.5">
              <IconBuilding size={14} />
              {details.company}
            </span>
          )}
          {details.college && (
            <span className="flex items-center gap-1.5">
              <IconSchool size={14} />
              {details.college}
            </span>
          )}
        </div>
      )}

      {socialLinks.length > 0 && (
        <div className="mt-4 flex gap-3">
          {socialLinks.map((l) => (
            <a
              key={l.platform}
              href={safeSocialHref(l.platform, l.url)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={l.label}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green"
            >
              <l.icon size={16} />
            </a>
          ))}
        </div>
      )}

      {details.skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {details.skills.map((skill) => (
            <span key={skill} className="rounded-full border border-border2 px-3 py-1.5 text-[12px] font-medium text-text2">
              {skill}
            </span>
          ))}
        </div>
      )}

      {details.interests && details.interests.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {details.interests.map((slug) => {
            const cat = getCategory(slug);
            return (
              <span key={slug} className="flex items-center gap-1.5 rounded-full border border-border2 px-3 py-1.5 text-[12px] font-medium text-text2">
                {cat && <span>{cat.emoji}</span>}
                {cat?.label ?? slug}
              </span>
            );
          })}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Communities</h2>
        {communities.length === 0 ? (
          <EmptyState icon={IconUsers} title="Not part of any communities yet" compact />
        ) : (
          <div className="flex flex-wrap gap-2">
            {communities.map((c) => {
              const visual = getCategoryVisual(c.category);
              return (
                <Link
                  key={c.id}
                  href={`/communities/${c.id}`}
                  className="flex items-center gap-2 rounded-full border border-border2 py-1.5 pl-1.5 pr-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: visual.bg, color: visual.light }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  {c.name}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Events attended</h2>
        {events.length === 0 ? (
          <EmptyState icon={IconCalendarEvent} title="No past events yet" compact />
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="card-elevated flex items-center justify-between gap-3 rounded-card bg-bg2 p-3 transition hover:border-border-card-hover"
              >
                <span className="min-w-0 truncate text-[13px] font-medium text-text">{e.event_name}</span>
                {e.city && (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-text3">
                    <IconMapPin size={12} />
                    {e.city}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
