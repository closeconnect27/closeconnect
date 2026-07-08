import { IconRosetteDiscountCheck } from "@tabler/icons-react";

export function VerifiedBadge({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-green" title={label ?? "Verified"}>
      <IconRosetteDiscountCheck size={size} className="fill-green text-bg2" />
      {label && <span className="text-[12px] font-semibold">{label}</span>}
    </span>
  );
}
