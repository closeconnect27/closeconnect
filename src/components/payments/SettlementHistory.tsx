import Link from "next/link";
import type { SettlementView } from "@/app/actions/organizerPayouts";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  eligible: "Ready for payout",
  processing: "Processing",
  processed: "Paid",
  failed: "Failed",
  on_hold: "On hold",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "text-text3",
  eligible: "text-purple",
  processing: "text-purple",
  processed: "text-green",
  failed: "text-pink",
  on_hold: "text-pink",
};

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/** "Payments & Payouts" -> "Settlement History" (spec section 4/22). Each
 * row is one event's settlement, since organizer_settlements is one row
 * per event (unique(event_id)). */
export function SettlementHistory({ settlements }: { settlements: SettlementView[] }) {
  if (settlements.length === 0) {
    return <p className="py-6 text-center text-[13px] text-text3">No settlements yet -- these appear once an event you host has completed and had at least one paid registration.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
      {settlements.map((s) => (
        <div key={s.id} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/events/${s.eventId}`} className="min-w-0 truncate text-[14px] font-bold text-text hover:text-green">
              {s.eventName}
            </Link>
            <span className={`shrink-0 text-[12px] font-bold ${STATUS_COLOR[s.status] ?? "text-text3"}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-text2">
            <span>Gross: {rupees(s.grossSalesPaise)}</span>
            {s.refundAmountPaise > 0 && <span>Refunds: {rupees(s.refundAmountPaise)}</span>}
            {s.platformFeePaise > 0 && <span>Platform fee: {rupees(s.platformFeePaise)}</span>}
            <span className="font-bold text-text">Net payout: {rupees(s.netPayablePaise)}</span>
          </div>
          {s.status === "failed" && s.failureReason && <p className="text-[12px] text-pink">{s.failureReason}</p>}
        </div>
      ))}
    </div>
  );
}
