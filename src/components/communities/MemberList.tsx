"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconUsers, IconSearch, IconUserMinus } from "@tabler/icons-react";
import { removeMember } from "@/app/actions/membership";

type Member = { user_id: string; role: string; profiles: { display_name: string } | null };

// Client-side filtering over the full list, not the API -- no new schema,
// and per the brief, fine as long as membership sizes stay in the low
// hundreds at most (a few hundred rows of name + a substring match is
// trivial client-side work). Flagged separately: nothing in the app caps
// community_members size today, so a community *could* organically grow
// past that -- worth a real check-in if usage ever gets there, not
// something to silently build server-side pagination for pre-emptively.
export function MemberList({
  communityId,
  members,
  ownerId,
  isStaff,
  currentUserId,
}: {
  communityId: string;
  members: Member[];
  ownerId: string | null;
  isStaff: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.profiles?.display_name ?? "member").toLowerCase().includes(q));
  }, [members, query]);

  function handleRemove(userId: string) {
    setError("");
    startTransition(async () => {
      const result = await removeMember(communityId, userId);
      if (result?.error) setError(result.error);
      else {
        setRemovingId(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-bold text-text3">
          <IconUsers size={14} />
          {members.length} member{members.length === 1 ? "" : "s"}
        </div>
        {members.length > 5 && (
          <div className="relative w-full max-w-[200px]">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="w-full rounded-full border border-border2 bg-bg3 py-1.5 pl-8 pr-3 text-[12px] transition focus:border-green"
            />
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-[12px] text-pink">{error}</p>}

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-text3">No members match “{query}”.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
          {filtered.map((m) => {
            const name = m.profiles?.display_name ?? "Member";
            // communities.owner_id is authoritative -- always show "Owner"
            // for that user regardless of what their (separate, mutable)
            // community_members.role row currently says.
            const rawRole = m.user_id === ownerId ? "owner" : m.role;
            const displayRole = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);
            const canRemove = isStaff && m.user_id !== ownerId && m.user_id !== currentUserId;

            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/profile/${m.user_id}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-tint text-[11px] font-bold text-green">
                  {name.charAt(0).toUpperCase()}
                </Link>
                <Link href={`/profile/${m.user_id}`} className="min-w-0 flex-1 truncate text-[13px] text-text hover:text-green hover:underline">
                  {name}
                  {displayRole !== "Member" && <span className="ml-2 font-semibold text-green">· {displayRole}</span>}
                </Link>

                {canRemove &&
                  (removingId === m.user_id ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleRemove(m.user_id)}
                        disabled={pending}
                        className="rounded-full bg-pink px-3 py-1 text-[11px] font-bold text-white transition hover:brightness-110"
                      >
                        {pending ? "Removing…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setRemovingId(null)}
                        className="text-[11px] text-text3 transition hover:text-text2"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRemovingId(m.user_id)}
                      aria-label={`Remove ${name}`}
                      className="shrink-0 text-text3 transition hover:text-pink"
                    >
                      <IconUserMinus size={16} />
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
