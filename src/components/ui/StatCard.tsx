import type { Icon } from "@tabler/icons-react";

export function StatCard({ icon: IconComponent, label, value }: { icon: Icon; label: string; value: number }) {
  return (
    <div className="card-elevated flex flex-1 items-center gap-3 rounded-card bg-bg2 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-tint">
        <IconComponent size={18} className="text-green" />
      </div>
      <div>
        <p className="font-heading text-[20px] font-extrabold leading-none">{value}</p>
        <p className="text-[11px] text-text3">{label}</p>
      </div>
    </div>
  );
}
