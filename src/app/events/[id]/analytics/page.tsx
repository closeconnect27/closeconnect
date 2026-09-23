import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconChartBar, IconTicket, IconEye } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventById } from "@/lib/queries/events";
import { getViewCount, getViewsByDay, getEventRegistrationMetrics, computeConversionRate, getReferrerBreakdown, getEventAddonMetrics } from "@/lib/queries/analytics";
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

  const [viewCount, viewsByDay, registrationMetrics, referrerBreakdown, addonMetrics] = await Promise.all([
    getViewCount(supabase, "event", id),
    getViewsByDay(supabase, "event", id),
    getEventRegistrationMetrics(supabase, id),
    getReferrerBreakdown(supabase, "event", id),
    getEventAddonMetrics(supabase, id),
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

        {addonMetrics.addons.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Add-ons</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
              <StatCard icon={IconChartBar} label="Add-on revenue" value={`₹${(addonMetrics.totalAddonRevenuePaise / 100).toLocaleString("en-IN")}`} />
              <StatCard icon={IconChartBar} label="Attach rate" value={addonMetrics.attachRate === null ? "—" : `${Math.round(addonMetrics.attachRate * 100)}%`} />
              <StatCard icon={IconChartBar} label="Avg. add-on spend" value={`₹${(addonMetrics.averageAddonSpendPaise / 100).toLocaleString("en-IN")}`} />
            </div>
            <div className="card-elevated mt-4 overflow-hidden rounded-card bg-bg2">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase text-text3">
                    <th className="px-4 py-2 font-semibold">Add-on</th>
                    <th className="px-4 py-2 font-semibold">Price</th>
                    <th className="px-4 py-2 font-semibold">Sold</th>
                    <th className="px-4 py-2 font-semibold">Remaining</th>
                    <th className="px-4 py-2 font-semibold">Revenue</th>
                    <th className="px-4 py-2 font-semibold">Refunds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {addonMetrics.addons.map((a) => (
                    <tr key={a.addonId ?? a.name} className={a.isActive === false ? "opacity-60" : ""}>
                      <td className="px-4 py-2 font-bold text-text">
                        {a.name}
                        {a.addonId === null && <span className="ml-1.5 font-normal text-text3">(deleted)</span>}
                        {a.isActive === false && <span className="ml-1.5 font-normal text-text3">(off sale)</span>}
                      </td>
                      <td className="px-4 py-2 text-text2">{a.price != null ? `₹${a.price.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-4 py-2 text-text2">{a.unitsSold}</td>
                      <td className="px-4 py-2 text-text2">{a.quantityAvailable != null ? Math.max(0, a.quantityAvailable - a.unitsSold) : "Unlimited"}</td>
                      <td className="px-4 py-2 text-text2">₹{(a.revenuePaise / 100).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2 text-text2">{a.refundsPaise > 0 ? `₹${(a.refundsPaise / 100).toLocaleString("en-IN")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
