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
  computeConversionRate,
  getNewMembersByMonth,
  getMostActiveMembers,
} from "@/lib/queries/analytics";
import { StatCard } from "@/components/ui/StatCard";
import { DailyBarChart } from "@/components/analytics/DailyBarChart";
import { PercentageBar } from "@/components/analytics/PercentageBar";
import { EmptyState } from "@/components/ui/EmptyState";

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
  // Native only -- every stat below is a community_members/join_mode
  // concept that never populates for an external listing, even one a
  // claim gave a real owner_id to (community_members is never seeded for
  // kind='external', so isStaff can still be true via owner_id alone).
  if (!isStaff || community.kind !== "native") {
    redirect(`/communities/${id}`);
  }

  const [viewCount, viewsByDay, joinMetrics, newMembersByMonth, activeMembers] = await Promise.all([
    getViewCount(supabase, "community", id),
    getViewsByDay(supabase, "community", id),
    getJoinRequestMetrics(supabase, id),
    getNewMembersByMonth(supabase, id),
    getMostActiveMembers(supabase, id),
  ]);

  const acceptanceRate = computeAcceptanceRate(joinMetrics.totals);
  // views -> a join request being *submitted* (approved+pending+rejected),
  // not views -> current member_count -- member_count can shrink (someone
  // leaves) independently of how many people the page ever converted,
  // which would make the rate silently wrong over time.
  const totalJoinAttempts = joinMetrics.totals.pending + joinMetrics.totals.approved + joinMetrics.totals.rejected;
  const conversionRate = computeConversionRate(viewCount, totalJoinAttempts);

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
          <StatCard icon={IconInbox} label="Pending join requests" value={joinMetrics.totals.pending} />
          <StatCard
            icon={IconChartBar}
            label="Acceptance rate"
            value={acceptanceRate === null ? 0 : Math.round(acceptanceRate * 100)}
          />
          <StatCard
            icon={IconChartBar}
            label="Views -> join rate"
            value={`${conversionRate === null ? 0 : Math.round(conversionRate * 100)}%`}
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
