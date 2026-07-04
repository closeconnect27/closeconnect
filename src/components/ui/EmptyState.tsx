import Link from "next/link";
import type { Icon } from "@tabler/icons-react";

/**
 * Every empty state gets a real design -- icon + one sentence + optional
 * CTA -- never a bare "No results" string. `compact` is for nested,
 * in-page moments (no pending requests, no messages yet) where a full-page
 * treatment would be too heavy; the full variant is for page-level emptiness
 * (no communities match these filters, no search results yet).
 */
export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
  compact,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <IconComponent size={28} className="text-text3" />
        <p className="text-[13px] text-text3">{title}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-bg2 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg3">
        <IconComponent size={26} className="text-text3" />
      </div>
      <h3 className="font-heading text-lg font-bold text-text">{title}</h3>
      {description && <p className="max-w-xs text-[14px] text-text2">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-2 rounded-full bg-green px-6 py-2.5 text-[14px] font-bold text-green-dark transition hover:bg-green-mid"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
