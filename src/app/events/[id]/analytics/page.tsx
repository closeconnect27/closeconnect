import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconChartBar, IconTicket, IconEye } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventById } from "@/lib/queries/events";
import { getViewCount, getViewsByDay, getEventRegistrationMetrics, computeConversionRate, getReferrerBreakdown } from "@/lib/queries/analytics";
import { StatCard } from "@/components/ui/StatCard";
import { DailyBarChart } from "@/components/analytics/DailyBarChart";
import { ReferrerBreakdown } from "@/components/analytics/ReferrerBreakdown";

// Event-side counterpart to communities/[id]/analytics -- same
// views/referrer-source shape (getViewCount/getViewsByDay/getReferrerBreakdown
// are already target_type-agnostic), just registrations instead of join
// requests as the conversion event. Host-only gate, no moderator-equivalent
// role exists for events the way community_members has one.
export default async function EventAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  let event;
  try {
    event = await getEventById(supabase, id);
  } catch {
    notFound();
  }

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (event.host_id !== user.id && !profile?.is_admin) redirect(`/events/${id}`);

  const [viewCount, viewsByDay, registrationMetrics, referrerBreakdown] = await Promise.all([
    getViewCount(supabase, "event", id),
    getViewsByDay(supabase, "event", id),
    getEventRegistrationMetrics(supabase, id),
    getReferrerBreakdown(supabase, "event", id),
  ]);

  const conversionRate = computeConversionRate(viewCount, registrationMetrics.total);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href={`/events/${id}/manage`} className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2">
          ← Back to manage
        </Link>
        <h1 className="font-heading text-[18px] font-bold leading-tight">{event.event_name} — Analytics</h1>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          <StatCard icon={IconEye} label="Total views" value={viewCount} />
          <StatCard icon={IconTicket} label="Registrations" value={registrationMetrics.total} />
          <StatCard
            icon={IconChartBar}
            label="Views -> reg. rate"
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
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Registrations over time</h2>
          <div className="card-elevated rounded-card bg-bg2 p-4">
            <DailyBarChart data={registrationMetrics.byDay} label="registrations" />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Where visitors come from</h2>
          <div className="card-elevated rounded-card bg-bg2 p-4">
            <ReferrerBreakdown data={referrerBreakdown} />
          </div>
        </section>
      </div>
    </div>
  );
}
