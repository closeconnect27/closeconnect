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
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import {
  getProfileDetails,
  getPublicProfileBasic,
  getCommunitiesJoinedPublic,
  getEventsAttendedPublic,
} from "@/lib/queries/profileDetails";
import { getCategoryVisual } from "@/lib/categories";
import { safeSocialHref } from "@/lib/validators/links";
import { EmptyState } from "@/components/ui/EmptyState";

// The base `profiles` row (display_name/avatar_url/host_rating) always
// resolves -- profiles_select_public is unrestricted. profile_details
// coming back null is the one signal that matters here: either this id
// doesn't exist as a profile at all, or profile_visibility says this
// viewer can't see it. Both render the same "private" state deliberately
// (SPEC.md Section 11 pattern: don't leak which case it is via a different
// message -- a 404-shaped id and a real private profile should look
// identical to an unauthorized viewer).
export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const basic = await getPublicProfileBasic(supabase, id);
  if (!basic) notFound();

  const details = await getProfileDetails(supabase, id);
  const isOwner = viewer?.id === id;

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
            <h1 className="truncate font-heading text-[16px] font-bold">{basic.display_name}</h1>
            {basic.host_rating > 0 && (
              <span className="flex items-center gap-1 text-[13px] text-text3">
                <IconStar size={13} className="fill-green text-green" />
                {basic.host_rating.toFixed(1)} host rating
              </span>
            )}
          </div>
          {isOwner && (
            <Link href="/profile/edit" className="btn-secondary shrink-0 px-4 py-2 text-[13px]">
              <IconPencil size={14} />
              <span className="hidden sm:inline">Edit profile</span>
            </Link>
          )}
        </div>

        {!details ? (
          <div className="mt-8">
            <EmptyState icon={IconLock} title="This profile is private" compact />
          </div>
        ) : (
          <ProfileDetailSections
            details={details}
            profileId={id}
            supabase={supabase}
            isMembersOnlyGate={details.profile_visibility === "members_only" && !viewer}
          />
        )}
      </div>
    </div>
  );
}

async function ProfileDetailSections({
  details,
  profileId,
  supabase,
  isMembersOnlyGate,
}: {
  details: NonNullable<Awaited<ReturnType<typeof getProfileDetails>>>;
  profileId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  isMembersOnlyGate: boolean;
}) {
  // This shouldn't actually be reachable -- if visibility is members_only
  // and there's no viewer, RLS would have already returned null for
  // `details` upstream. Kept as a defensive second check rather than
  // trusting that the caller always evaluates it in the same order.
  if (isMembersOnlyGate) {
    return (
      <div className="mt-8">
        <EmptyState icon={IconLock} title="Sign in to view this profile" compact />
      </div>
    );
  }

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
      {details.bio && <p className="mt-6 whitespace-pre-wrap text-[14px] leading-relaxed text-text2">{details.bio}</p>}

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
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
                    <img src={c.logo_url} alt="" className="h-6 w-6 rounded-full object-contain" />
                  ) : (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: visual.bg, color: visual.light }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
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
