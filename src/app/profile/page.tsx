import Link from "next/link";
import { IconLayoutDashboard, IconUsers, IconCalendarEvent } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { getMyCommunities, getMyEvents } from "@/lib/queries/dashboard";
import { getMyJoinedCommunities, getMyRegisteredEvents } from "@/lib/queries/profile";
import { HostCommunityRow } from "@/components/host/HostCommunityRow";
import { HostEventRow } from "@/components/host/HostEventRow";
import { RegisteredEventRow } from "@/components/profile/RegisteredEventRow";
import { EmptyState } from "@/components/ui/EmptyState";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A distinct page from the Host Dashboard on purpose: this is "what am I
// part of" (owned + joined, hosting + attending), the dashboard is "what do
// I need to act on" (pending requests, check-in, CSV export). Same data can
// appear in both, but the framing and the actions available differ.
export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const initial = (profile?.display_name ?? user.email ?? "?").charAt(0).toUpperCase();

  const [ownedCommunities, joinedCommunities, hostedEvents, registeredEvents] = await Promise.all([
    getMyCommunities(supabase, user.id),
    getMyJoinedCommunities(supabase, user.id),
    getMyEvents(supabase, user.id),
    getMyRegisteredEvents(supabase, user.id),
  ]);

  const today = todayIso();
  const upcomingRegistered = registeredEvents.filter((e) => e.event_date >= today);
  const pastRegistered = registeredEvents.filter((e) => e.event_date < today);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-tint text-[20px] font-bold text-green">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-[18px] font-extrabold">
              {profile?.display_name ?? "Your profile"}
            </h1>
            <p className="truncate text-[13px] text-text3">{user.email}</p>
          </div>
          <Link href="/host/dashboard" className="btn-secondary shrink-0 px-4 py-2 text-[13px]">
            <IconLayoutDashboard size={14} />
            <span className="hidden sm:inline">Host dashboard</span>
          </Link>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">My communities</h2>

          <h3 className="mb-2 text-[13px] font-bold text-text2">Own</h3>
          {ownedCommunities.length === 0 ? (
            <EmptyState icon={IconUsers} title="You don't own any communities yet" compact />
          ) : (
            <div className="mb-6 flex flex-col gap-2">
              {ownedCommunities.map((c) => (
                <HostCommunityRow key={c.id} community={c} />
              ))}
            </div>
          )}

          <h3 className="mb-2 text-[13px] font-bold text-text2">Joined</h3>
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
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">My events</h2>

          <h3 className="mb-2 text-[13px] font-bold text-text2">Hosting</h3>
          {hostedEvents.length === 0 ? (
            <EmptyState icon={IconCalendarEvent} title="You're not hosting any events yet" compact />
          ) : (
            <div className="mb-6 flex flex-col gap-2">
              {hostedEvents.map((e) => (
                <HostEventRow key={e.id} event={e} />
              ))}
            </div>
          )}

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

        <form action={signOut} className="mt-8">
          <button type="submit" className="btn-secondary w-full py-2.5 text-[13px]">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
