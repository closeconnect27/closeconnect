import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconUsers, IconInbox, IconChartBar } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById } from "@/lib/queries/communities";
import { getCommunityMembership } from "@/lib/queries/membership";
import {
  getViewCount,
  getViewsByDay,
  getJoinRequestMetrics,
  computeAcceptanceRate,
  getNewMembersByMonth,
  getTrafficSourceBreakdown,
  getMostActiveMembers,
} from "@/lib/queries/analytics";
import { StatCard } from "@/components/ui/StatCard";
import { DailyBarChart } from "@/components/analytics/DailyBarChart";
import { PercentageBar } from "@/components/analytics/PercentageBar";
import { EmptyState } from "@/components/ui/EmptyState";

const SOURCE_COLORS: Record<string, string> = {
  direct: "#5dcaa5",
  search: "#818cf8",
  social: "#c4b5fd",
  instagram: "#f9a8d4",
  linkedin: "#93c5fd",
  other: "#a8a8a8",
  unknown: "#444444",
};

export default async function CommunityAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  let community;
  try {
    community = await getCommunityById(supabase, id);
  } catch {
    notFound();
  }

  // Page-level gate in addition to RLS (SPEC.md Section 11) -- redirect
  // rather than a page full of zeros a non-staff caller would otherwise
  // silently see (every query below relies on page_views_select_owner_or_host
  // etc. to actually enforce this). Same isStaff derivation as the
  // community detail page: owner_id is authoritative, community_members
  // is the fallback for a moderator role.
  const membership = await getCommunityMembership(supabase, id, user.id);
  const isStaff = community.owner_id === user.id || membership?.role === "owner" || membership?.role === "moderator";
  if (!isStaff) {
    redirect(`/communities/${id}`);
  }

  const [viewCount, viewsByDay, joinMetrics, newMembersByMonth, traffic, activeMembers] = await Promise.all([
    getViewCount(supabase, "community", id),
    getViewsByDay(supabase, "community", id),
    getJoinRequestMetrics(supabase, id),
    getNewMembersByMonth(supabase, id),
    getTrafficSourceBreakdown(supabase, "community", id),
    getMostActiveMembers(supabase, id),
  ]);

  const acceptanceRate = computeAcceptanceRate(joinMetrics.totals);
  const totalTraffic = Object.values(traffic).reduce((a, b) => a + b, 0);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href={`/communities/${id}`} className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2">
          ← Back to community
        </Link>
        <h1 className="font-heading text-[18px] font-bold leading-tight">{community.name} — Analytics</h1>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={IconChartBar} label="Total views" value={viewCount} />
          <StatCard icon={IconUsers} label="Members" value={community.member_count} />
          <StatCard icon={IconInbox} label="Join requests" value={joinMetrics.totals.pending + joinMetrics.totals.approved + joinMetrics.totals.rejected} />
          <StatCard
            icon={IconChartBar}
            label="Acceptance rate"
            value={acceptanceRate === null ? 0 : Math.round(acceptanceRate * 100)}
          />
        </div>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Views over time</h2>
          <div className="card-elevated rounded-card bg-bg2 p-4">
            <DailyBarChart data={viewsByDay} label="views" />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">New members by month</h2>
          <div className="card-elevated rounded-card bg-bg2 p-4">
            {newMembersByMonth.length === 0 ? (
              <p className="text-[12px] text-text3">No members yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {newMembersByMonth.map((m) => (
                  <PercentageBar
                    key={m.month}
                    label={m.month}
                    count={m.count}
                    total={Math.max(...newMembersByMonth.map((x) => x.count))}
                    color="#5dcaa5"
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Traffic sources</h2>
          <div className="card-elevated flex flex-col gap-2 rounded-card bg-bg2 p-4">
            {totalTraffic === 0 ? (
              <p className="text-[12px] text-text3">No view data yet.</p>
            ) : (
              Object.entries(traffic)
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => (
                  <PercentageBar key={source} label={source} count={count} total={totalTraffic} color={SOURCE_COLORS[source]} />
                ))
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Most active members</h2>
          {activeMembers.length === 0 ? (
            <EmptyState icon={IconUsers} title="No messages yet" compact />
          ) : (
            <div className="flex flex-col gap-2">
              {activeMembers.map((m, i) => (
                <div key={m.userId} className="card-elevated flex items-center justify-between gap-3 rounded-card bg-bg2 p-3">
                  <Link href={`/profile/${m.userId}`} className="flex items-center gap-2 text-[13px] font-medium text-text transition hover:text-green hover:underline">
                    <span className="font-mono text-[11px] text-text3">#{i + 1}</span>
                    {m.displayName}
                  </Link>
                  <span className="text-[12px] text-text3">{m.messageCount} messages</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
