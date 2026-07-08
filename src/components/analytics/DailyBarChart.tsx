// Plain CSS height bars, not a charting library -- same reasoning as
// PercentageBar. Fine for a handful of data points on a dashboard; a real
// time-series chart library would be overkill here.
export function DailyBarChart({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  if (data.length === 0) {
    return <p className="text-[12px] text-text3">No {label.toLowerCase()} yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex h-24 items-end gap-1">
      {data.map((d) => (
        <div key={d.date} className="group relative flex-1">
          <div
            className="w-full rounded-t bg-green transition-all group-hover:bg-green-mid"
            style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
          />
          <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-bg2 px-1.5 py-0.5 text-[10px] text-text opacity-0 shadow-card transition-opacity group-hover:opacity-100">
            {d.date}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}
