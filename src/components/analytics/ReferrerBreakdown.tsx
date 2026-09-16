import { PercentageBar } from "@/components/analytics/PercentageBar";

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  search: "Search",
  social: "Social",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  other: "Other",
};
const SOURCE_COLORS: Record<string, string> = {
  direct: "#5dcaa5",
  search: "#7f77dd",
  social: "#1d9e75",
  instagram: "#d4537e",
  linkedin: "#3b82f6",
  other: "#888888",
};

/** Where views are actually coming from -- shared between the per-community/
 * per-event analytics pages and the admin platform-wide dashboard, same
 * getReferrerBreakdown/getPlatformReferrerBreakdown row shape either way. */
export function ReferrerBreakdown({ data }: { data: { source: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <p className="text-[12px] text-text3">No views yet.</p>;

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <PercentageBar
          key={d.source}
          label={SOURCE_LABELS[d.source] ?? d.source}
          count={d.count}
          total={total}
          color={SOURCE_COLORS[d.source] ?? "#888888"}
        />
      ))}
    </div>
  );
}
