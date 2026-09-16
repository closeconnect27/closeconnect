import { redirect } from "next/navigation";
import Link from "next/link";
import {
  IconUsers,
  IconUsersGroup,
  IconCalendarEvent,
  IconTicket,
  IconInbox,
  IconFlag,
  IconShieldLock,
  IconCashBanknote,
  IconEye,
} from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminPlatformStats, getNewUsersByMonth, getTopContent, getPlatformReferrerBreakdown } from "@/lib/queries/admin";
import { getOpenReports } from "@/lib/queries/reports";
import { getPendingClaims } from "@/lib/queries/claims";
import { StatCard } from "@/components/ui/StatCard";
import { PercentageBar } from "@/components/analytics/PercentageBar";
import { ReferrerBreakdown } from "@/components/analytics/ReferrerBreakdown";
import { ReportsQueueSection } from "@/components/admin/ReportsQueueSection";
import { PendingClaimsSection } from "@/components/communities/PendingClaimsSection";

// Platform-wide, admin-only -- distinct from /host/dashboard (a host's own
// communities/events) even for an admin who is also a host. PendingClaimsSection
// used to render inline on the host dashboard for admins; it now lives here
// instead, alongside the reports queue and platform stats, as one coherent
// admin surface rather than mixed into a regular host's own page.
export default async function AdminPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/host/dashboard");

  // page_views_select_owner_or_host only ever lets a caller see their own
  // content's views (same RLS shape as everything else in this app) -- the
  // admin client is the only way to see the platform-wide top content and
  // referrer numbers below, same posture as getPayoutSummary.
  const admin = createAdminClient();

  const [stats, newUsersByMonth, reports, claims, topEvents, topCommunities, referrerBreakdown] = await Promise.all([
    getAdminPlatformStats(supabase),
    getNewUsersByMonth(supabase),
    getOpenReports(supabase),
    getPendingClaims(supabase),
    getTopContent(admin, "event", 5),
    getTopContent(admin, "community", 5),
    getPlatformReferrerBreakdown(admin),
  ]);

  const recentMonths = newUsersByMonth.slice(-6);
  const maxMonthCount = Math.max(1, ...recentMonths.map((m) => m.count));

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="flex items-center gap-2 font-heading text-[18px] font-bold leading-tight">
          <IconShieldLock size={20} className="text-purple" />
          Admin
        </h1>
        <p className="text-[14px] text-text3">Platform-wide numbers and the moderation/review queues.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={IconUsers} label="Total users" value={stats.totalUsers} />
          <StatCard icon={IconUsersGroup} label="Native communities" value={stats.nativeCommunities} />
          <StatCard icon={IconUsersGroup} label="External communities" value={stats.externalCommunities} />
          <StatCard icon={IconCalendarEvent} label="Total events" value={stats.totalEvents} />
          <StatCard icon={IconTicket} label="Total registrations" value={stats.totalRegistrations} />
          <StatCard icon={IconInbox} label="Pending claims" value={stats.pendingClaims} />
          <StatCard icon={IconFlag} label="Open reports" value={stats.openReports} />
        </div>

        <Link href="/admin/payouts" className="btn-secondary mt-3 inline-flex px-4 py-2 text-[13px]">
          <IconCashBanknote size={14} />
          Organizer payouts
        </Link>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
            New users, last 6 months
          </h2>
          <div className="card-elevated rounded-card bg-bg2 p-4">
            {recentMonths.length === 0 ? (
              <p className="text-[12px] text-text3">No signups yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentMonths.map((m) => (
                  <PercentageBar key={m.month} label={m.month} count={m.count} total={maxMonthCount} color="#5dcaa5" />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Top events by views</h2>
            <div className="card-elevated flex flex-col gap-1.5 rounded-card bg-bg2 p-4">
              {topEvents.length === 0 ? (
                <p className="text-[12px] text-text3">No views yet.</p>
              ) : (
                topEvents.map((e, i) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className="flex items-center justify-between gap-3 text-[13px] text-text2 transition hover:text-green"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-[11px] text-text3">#{i + 1}</span> {e.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] text-text3">
                      <IconEye size={12} />
                      {e.views}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Top communities by views</h2>
            <div className="card-elevated flex flex-col gap-1.5 rounded-card bg-bg2 p-4">
              {topCommunities.length === 0 ? (
                <p className="text-[12px] text-text3">No views yet.</p>
              ) : (
                topCommunities.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/communities/${c.id}`}
                    className="flex items-center justify-between gap-3 text-[13px] text-text2 transition hover:text-green"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-[11px] text-text3">#{i + 1}</span> {c.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] text-text3">
                      <IconEye size={12} />
                      {c.views}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
            Where visitors come from, platform-wide
          </h2>
          <div className="card-elevated rounded-card bg-bg2 p-4">
            <ReferrerBreakdown data={referrerBreakdown} />
          </div>
        </section>

        <ReportsQueueSection reports={reports} />
        <PendingClaimsSection claims={claims} />
      </div>
    </div>
  );
}
