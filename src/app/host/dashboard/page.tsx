import Link from "next/link";
import { IconUsers, IconCalendarEvent, IconInbox, IconTicket, IconPlus } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyCommunities, getMyEvents } from "@/lib/queries/dashboard";
import { getPendingJoinRequests, getCommunityFormFields } from "@/lib/queries/membership";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { HostCommunityRow } from "@/components/host/HostCommunityRow";
import { HostEventRow } from "@/components/host/HostEventRow";
import { PendingRequests } from "@/components/communities/PendingRequests";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function HostDashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [communities, events] = await Promise.all([
    getMyCommunities(supabase, user.id),
    getMyEvents(supabase, user.id),
  ]);

  const requestModeCommunities = communities.filter((c) => c.kind === "native" && c.join_mode === "request");
  const pendingByCommunity = await Promise.all(
    requestModeCommunities.map(async (c) => ({
      community: c,
      requests: await getPendingJoinRequests(supabase, c.id),
      formFields: await getCommunityFormFields(supabase, c.id),
    })),
  );
  const needsAttention = pendingByCommunity.filter((p) => p.requests.length > 0);
  const totalPending = needsAttention.reduce((sum, p) => sum + p.requests.length, 0);

  const today = todayIso();
  const upcomingEvents = events.filter((e) => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const pastEvents = events.filter((e) => e.event_date < today);
  const totalRegistrants = events.reduce((sum, e) => sum + e.registeredCount, 0);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[28px] font-extrabold leading-tight">Host dashboard</h1>
            <p className="text-[14px] text-text3">Your communities and events, in one place.</p>
          </div>
          <Link href="/create" className="btn-primary shrink-0 px-4 py-2.5 text-[13px]">
            <IconPlus size={14} />
            <span className="hidden sm:inline">Create</span>
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={IconUsers} label="communities" value={communities.length} />
          <StatCard icon={IconCalendarEvent} label="upcoming events" value={upcomingEvents.length} />
          <StatCard icon={IconInbox} label="pending requests" value={totalPending} />
          <StatCard icon={IconTicket} label="total registrants" value={totalRegistrants} />
        </div>

        {needsAttention.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Needs your attention</h2>
            <div className="flex flex-col gap-6">
              {needsAttention.map(({ community, requests, formFields }) => (
                <div key={community.id}>
                  <Link
                    href={`/communities/${community.id}`}
                    className="mb-2 block text-[13px] font-bold text-text transition hover:text-green"
                  >
                    {community.name}
                  </Link>
                  <PendingRequests communityId={community.id} requests={requests} formFields={formFields} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Your communities</h2>
          {communities.length === 0 ? (
            <EmptyState
              icon={IconUsers}
              title="No communities yet"
              description="Start one -- it takes less than a minute."
              action={{ label: "Start a community", href: "/communities/new" }}
              compact
            />
          ) : (
            <div className="flex flex-col gap-2">
              {communities.map((c) => (
                <HostCommunityRow
                  key={c.id}
                  community={c}
                  pendingCount={needsAttention.find((p) => p.community.id === c.id)?.requests.length ?? 0}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Upcoming events</h2>
          {upcomingEvents.length === 0 ? (
            <EmptyState
              icon={IconCalendarEvent}
              title="No upcoming events"
              description="Host one -- ticketed or free, with or without a community."
              action={{ label: "Host an event", href: "/events/new" }}
              compact
            />
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingEvents.map((e) => (
                <HostEventRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </section>

        {pastEvents.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Past events</h2>
            <div className="flex flex-col gap-2 opacity-70">
              {pastEvents.map((e) => (
                <HostEventRow key={e.id} event={e} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
