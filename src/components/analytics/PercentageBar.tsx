// Plain CSS width percentage, not a charting library -- per the explicit
// instruction to justify a new dependency before adding one. A handful of
// labeled horizontal bars don't need Recharts/Chart.js; this is the whole
// component.
export function PercentageBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-24 shrink-0 truncate text-text2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg3">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-[12px] text-text3">
        {count} ({pct}%)
      </span>
    </div>
  );
}
