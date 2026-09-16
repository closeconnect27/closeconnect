import Link from "next/link";
import { IconLayoutDashboard, IconUsers, IconCalendarEvent, IconUserCircle } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { getMyJoinedCommunities, getMyRegisteredEvents } from "@/lib/queries/profile";
import { getIncomingFollowRequests } from "@/lib/queries/profileDetails";
import { HostCommunityRow } from "@/components/host/HostCommunityRow";
import { RegisteredEventRow } from "@/components/profile/RegisteredEventRow";
import { IncomingFollowRequests } from "@/components/profile/IncomingFollowRequests";
import { EmptyState } from "@/components/ui/EmptyState";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NativeOnly } from "@/components/system/PlatformGate";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A distinct page from the Host Dashboard on purpose: this is "what am I
// part of as a member/attendee" (joined communities, registered events),
// the dashboard is "what do I own or host" (owned communities, hosted
// events, pending requests, check-in, CSV export). Owned/hosted content
// deliberately does NOT also appear here -- it used to, and having the same
// community or event listed in two different places with two different
// action sets read as a bug, not a feature.
export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const initial = (profile?.display_name ?? user.email ?? "?").charAt(0).toUpperCase();

  const [joinedCommunities, registeredEvents, incomingFollowRequests] = await Promise.all([
    getMyJoinedCommunities(supabase, user.id),
    getMyRegisteredEvents(supabase, user.id),
    getIncomingFollowRequests(supabase, user.id),
  ]);

  const today = todayIso();
  const upcomingRegistered = registeredEvents.filter((e) => e.event_date !== null && e.event_date >= today);
  const pastRegistered = registeredEvents.filter((e) => e.event_date === null || e.event_date < today);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="card-elevated flex flex-col gap-4 rounded-card bg-bg2 p-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-tint text-[20px] font-bold text-green">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-[14px] font-bold">
                {profile?.display_name ?? "Your profile"}
              </h1>
              <p className="truncate text-[13px] text-text3">{user.email}</p>
            </div>
          </div>
          {/* Its own full-width row below the avatar on mobile (not squeezed
              to the right of the name/email in a single row) -- that
              layout only had room to show the icons, not the labels
              ("View public profile"/"Host dashboard" were hidden below sm
              entirely), which read as two unlabeled logos. Shorter labels
              here so they fit comfortably in a half-width mobile button. */}
          <div className="flex gap-2 sm:shrink-0">
            <Link href={`/profile/${user.id}`} className="btn-secondary flex-1 px-4 py-2 text-[13px] sm:flex-none">
              <IconUserCircle size={14} />
              View profile
            </Link>
            <Link href="/host/dashboard" className="btn-secondary flex-1 px-4 py-2 text-[13px] sm:flex-none">
              <IconLayoutDashboard size={14} />
              Dashboard
            </Link>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">My communities</h2>

          {joinedCommunities.length === 0 ? (
            <EmptyState icon={IconUsers} title="You haven't joined any communities yet" compact />
          ) : (
            <div className="flex flex-col gap-2">
              {joinedCommunities.map((c) => (
                <HostCommunityRow key={c.id} community={c} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">My events</h2>

          <h3 className="mb-2 text-[13px] font-bold text-text2">Registered -- upcoming</h3>
          {upcomingRegistered.length === 0 ? (
            <EmptyState icon={IconCalendarEvent} title="No upcoming registrations" compact />
          ) : (
            <div className="mb-6 flex flex-col gap-2">
              {upcomingRegistered.map((e) => (
                <RegisteredEventRow key={e.responseId} event={e} />
              ))}
            </div>
          )}

          {pastRegistered.length > 0 && (
            <>
              <h3 className="mb-2 text-[13px] font-bold text-text2">Registered -- past</h3>
              <div className="flex flex-col gap-2 opacity-70">
                {pastRegistered.map((e) => (
                  <RegisteredEventRow key={e.responseId} event={e} />
                ))}
              </div>
            </>
          )}
        </section>

        <IncomingFollowRequests requests={incomingFollowRequests} />

        <Link href="/profile/edit" className="btn-secondary mt-8 block w-full py-2.5 text-center text-[13px]">
          Edit profile
        </Link>

        <Link href="/profile/blocked" className="mt-3 block w-full py-1 text-center text-[12px] text-text3 transition hover:text-text2">
          Blocked users
        </Link>

        {/* Header's own toggle is web-only -- the app's theme setting lives
            here instead, same place a native app's Settings screen would
            put it. */}
        <NativeOnly>
          <div className="mt-8 flex items-center justify-between rounded-card bg-bg2 p-4">
            <span className="text-[13px] font-medium text-text2">Appearance</span>
            <ThemeToggle />
          </div>
        </NativeOnly>

        <form action={signOut} className="mt-3">
          <button type="submit" className="btn-secondary w-full py-2.5 text-[13px]">
            Sign out
          </button>
        </form>

        {/* Support/legal used to live in a footer shown on every page --
            fine for a website, but it's the single biggest thing that made
            the Android app read as "a website in a wrapper" instead of a
            real app (SiteChrome hides that footer entirely on native now).
            This is its one reachable home instead, in the same place a
            native app's own Settings screen would put it. */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-6 text-[12px] text-text3">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="mailto:support@closeconnect.in" className="transition hover:text-text2">
              Support
            </a>
            <Link href="/terms" className="transition hover:text-text2">
              Terms of Service
            </Link>
            <Link href="/privacy" className="transition hover:text-text2">
              Privacy Policy
            </Link>
            <Link href="/cancellation-refund" className="transition hover:text-text2">
              Cancellation &amp; Refund Policy
            </Link>
          </div>
          <span>© {new Date().getFullYear()} CloseConnect</span>
        </div>
      </div>
    </div>
  );
}
