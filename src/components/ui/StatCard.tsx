import type { Icon } from "@tabler/icons-react";

export function StatCard({ icon: IconComponent, label, value }: { icon: Icon; label: string; value: number | string }) {
  return (
    <div className="card-elevated flex min-w-0 flex-1 items-center gap-2 rounded-card bg-bg2 p-3 sm:gap-3 sm:p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-tint sm:h-10 sm:w-10">
        <IconComponent size={16} className="text-green sm:size-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-heading text-[14px] font-bold leading-none">{value}</p>
        {/* Wraps instead of truncating -- three of these sit side by side
            (profile/[id]/page.tsx) and at phone width there isn't enough
            room per card for a label like "Communities created" to survive
            a single-line ellipsis; two lines reads fine and never clips
            mid-word. */}
        <p className="mt-1 font-mono text-[10px] font-medium leading-tight text-text3 sm:text-[11px]">{label}</p>
      </div>
    </div>
  );
}
