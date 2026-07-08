import { PercentageBar } from "@/components/analytics/PercentageBar";

// Reuses the plain-CSS bar from community analytics (Branch 3) rather than
// a new component -- same "labeled horizontal bar out of N" shape, just a
// different funnel. Percentages are relative to the top of the funnel
// (whichever of Interested/Registered is larger -- Interested is an
// optional signal and often trails Registered since most people register
// directly without marking interest first, so anchoring on Registered
// alone would make Interested read as "over 100%" of nothing).
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
  const total = Math.max(interestCount, registeredCount, 1);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-bg2 p-4">
      <h2 className="font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Funnel</h2>
      <PercentageBar label="Interested" count={interestCount} total={total} color="var(--color-text3)" />
      <PercentageBar label="Registered" count={registeredCount} total={total} color="var(--color-green)" />
      <PercentageBar label="Paid" count={paidCount} total={total} color="var(--color-green)" />
      <PercentageBar label="Checked in" count={checkedInCount} total={total} color="var(--color-green)" />
      {eventHasPassed && <PercentageBar label="No-show" count={noShowCount} total={total} color="var(--color-pink)" />}
    </div>
  );
}
