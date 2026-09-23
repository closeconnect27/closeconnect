import { PercentageBar } from "@/components/analytics/PercentageBar";

const PLATFORM_LABELS: Record<string, string> = {
  web: "Web",
  app: "App",
};
const PLATFORM_COLORS: Record<string, string> = {
  web: "#5dcaa5",
  app: "#7f77dd",
};

/** Web vs app -- a sibling of ReferrerBreakdown rather than a reuse of it:
 * that component's labels/colors are hardcoded to referrer_source's own
 * bucket set (direct/search/social/...), so a platform ("web"/"app") would
 * just fall through its `?? source` fallback with no color of its own. Same
 * visual pattern (PercentageBar rows) either way. */
export function PlatformBreakdown({ data }: { data: { platform: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <p className="text-[12px] text-text3">No views yet.</p>;

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <PercentageBar
          key={d.platform}
          label={PLATFORM_LABELS[d.platform] ?? d.platform}
          count={d.count}
          total={total}
          color={PLATFORM_COLORS[d.platform] ?? "#888888"}
        />
      ))}
    </div>
  );
}
