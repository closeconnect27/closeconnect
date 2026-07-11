import { PercentageBar } from "@/components/analytics/PercentageBar";

// Interested/Registered are plain counts -- there's nothing upstream of
// them in this funnel to express a rate against. Paid and Checked-in are
// each a conversion off the stage directly above them (paid / registered,
// checked-in / paid), not off the funnel's overall top, so a low
// check-in rate reads as "people who paid didn't show" rather than being
// diluted by however many never got past Interested.
export function EventFunnel({
  interestCount,
  registeredCount,
  paidCount,
  checkedInCount,
  noShowCount,
  eventHasPassed,
}: {
  interestCount: number;
  registeredCount: number;
  paidCount: number;
  checkedInCount: number;
  noShowCount: number;
  eventHasPassed: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-bg2 p-4">
      <h2 className="font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Funnel</h2>
      <CountRow label="Interested" count={interestCount} />
      <CountRow label="Registered" count={registeredCount} />
      <PercentageBar label="Paid" count={paidCount} total={Math.max(registeredCount, 1)} color="var(--color-green)" />
      <PercentageBar label="Checked in" count={checkedInCount} total={Math.max(paidCount, 1)} color="var(--color-green)" />
      {eventHasPassed && (
        <PercentageBar label="No-show" count={noShowCount} total={Math.max(registeredCount, 1)} color="var(--color-pink)" />
      )}
    </div>
  );
}

function CountRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-text2">{label}</span>
      <span className="font-mono text-[12px] font-semibold text-text">{count}</span>
    </div>
  );
}
