import { redirect } from "next/navigation";
import {
  IconUsers,
  IconUsersGroup,
  IconCalendarEvent,
  IconTicket,
  IconInbox,
  IconRosetteDiscountCheck,
  IconFlag,
  IconShieldLock,
} from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminPlatformStats, getNewUsersByMonth } from "@/lib/queries/admin";
import { getOpenReports } from "@/lib/queries/reports";
import { getPendingClaims } from "@/lib/queries/claims";
import { getPendingVerificationRequests } from "@/lib/queries/verification";
import { StatCard } from "@/components/ui/StatCard";
import { PercentageBar } from "@/components/analytics/PercentageBar";
import { ReportsQueueSection } from "@/components/admin/ReportsQueueSection";
import { PendingClaimsSection } from "@/components/communities/PendingClaimsSection";
import { PendingVerificationRequestsSection } from "@/components/verification/PendingVerificationRequestsSection";

// Platform-wide, admin-only -- distinct from /host/dashboard (a host's own
// communities/events) even for an admin who is also a host. Both
// PendingClaimsSection/PendingVerificationRequestsSection used to render
// inline on the host dashboard for admins; they now live here instead,
// alongside the reports queue and platform stats, as one coherent admin
// surface rather than mixed into a regular host's own page.
export default async function AdminPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/host/dashboard");

  const [stats, newUsersByMonth, reports, claims, verifications] = await Promise.all([
    getAdminPlatformStats(supabase),
    getNewUsersByMonth(supabase),
    getOpenReports(supabase),
    getPendingClaims(supabase),
    getPendingVerificationRequests(supabase),
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
          <StatCard icon={IconRosetteDiscountCheck} label="Pending verifications" value={stats.pendingVerifications} />
          <StatCard icon={IconFlag} label="Open reports" value={stats.openReports} />
        </div>

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

        <ReportsQueueSection reports={reports} />
        <PendingClaimsSection claims={claims} />
        <PendingVerificationRequestsSection requests={verifications} />
      </div>
    </div>
  );
}
