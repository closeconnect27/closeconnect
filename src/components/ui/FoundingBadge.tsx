import { IconSeeding } from "@tabler/icons-react";

// Admin-curated marker (communities.is_founding / profiles.is_founding_host,
// 0054) for the earliest real organizers -- a status signal, not a
// discount code, so it renders everywhere the same way rather than
// varying by context.
export function FoundingBadge({ size = 12, label = "Founding" }: { size?: number; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-purple/15 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-purple"
      title="One of Close.Connect's earliest communities/hosts"
    >
      <IconSeeding size={size} />
      {label}
    </span>
  );
}
