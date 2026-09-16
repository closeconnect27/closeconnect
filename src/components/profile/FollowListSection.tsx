import Link from "next/link";
import type { FollowListEntry } from "@/lib/queries/profileDetails";

// Shared by the Followers/Following sections on the public profile page --
// same avatar+name row shape either way, just a different backing list and
// empty-state copy.
export function FollowListSection({
  title,
  entries,
  emptyLabel,
}: {
  title: string;
  entries: FollowListEntry[];
  emptyLabel: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        {title} ({entries.length})
      </h2>
      {entries.length === 0 ? (
        <p className="text-[13px] text-text3">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((p) => (
            <Link
              key={p.id}
              href={`/profile/${p.id}`}
              className="flex items-center gap-3 rounded-card-sm px-2 py-2 transition hover:bg-bg2"
            >
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
                <img src={p.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
                  {p.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-[13px] font-medium text-text">{p.display_name}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
