"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconUsers, IconSearch, IconUserMinus, IconShieldPlus, IconShieldMinus, IconLock } from "@tabler/icons-react";
import { removeMember, setMemberRole, loadMoreCommunityMembers } from "@/app/actions/membership";

type Member = { user_id: string; role: string; profiles: { display_name: string } | null };

// Server-paginated (getCommunityMembers, 50/page, staff-first) -- `members`
// is only the first page; `totalCount` is the real roster size.
// "Load more" fetches subsequent pages on demand rather than shipping the
// whole roster on first render, which is what "nothing caps
// community_members size today" (the previous version of this comment)
// was flagging as the actual risk once a community grows past a few
// hundred. Client-side search still only searches what's been loaded so
// far -- a real limitation, not silently wrong, called out in the empty
// state below when more pages remain.
export function MemberList({
  communityId,
  members,
  totalCount,
  ownerId,
  isStaff,
  isOwner,
  membersListVisible,
  currentUserId,
}: {
  communityId: string;
  members: Member[];
  totalCount: number;
  ownerId: string | null;
  isStaff: boolean;
  isOwner: boolean;
  membersListVisible: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [loadedMembers, setLoadedMembers] = useState(members);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [rolePendingId, setRolePendingId] = useState<string | null>(null);

  // Owner/admins always show, WhatsApp-style, regardless of the toggle --
  // only an ordinary member's view of the *rest* of the roster is hidden.
  // The server query already orders staff-first; this re-derives the same
  // rank client-side only to decide who survives the visibility filter,
  // not to re-sort (owner_id is authoritative and cheap to check here too).
  const staffFirst = [...loadedMembers].sort((a, b) => {
    const rank = (m: Member) => (m.user_id === ownerId ? 0 : m.role === "moderator" ? 1 : 2);
    return rank(a) - rank(b);
  });
  const visibleMembers = membersListVisible || isStaff ? staffFirst : staffFirst.filter((m) => m.user_id === ownerId || m.role === "moderator");
  // Against the real total, not just this page -- staff sort first server-side
  // too, so they're already all present in loadedMembers well before this
  // matters for any realistically-sized admin team.
  const hiddenCount = totalCount - visibleMembers.length;
  const canLoadMore = (membersListVisible || isStaff) && loadedMembers.length < totalCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleMembers;
    return visibleMembers.filter((m) => (m.profiles?.display_name ?? "member").toLowerCase().includes(q));
  }, [visibleMembers, query]);

  function handleLoadMore() {
    setLoadingMore(true);
    startTransition(async () => {
      const { members: nextPage } = await loadMoreCommunityMembers(communityId, loadedMembers.length);
      setLoadedMembers((prev) => [...prev, ...nextPage]);
      setLoadingMore(false);
    });
  }

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

  function handleRoleChange(userId: string, role: "moderator" | "member") {
    setError("");
    setRolePendingId(userId);
    startTransition(async () => {
      const result = await setMemberRole(communityId, userId, role);
      setRolePendingId(null);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-bold text-text3">
          <IconUsers size={14} />
          {totalCount} member{totalCount === 1 ? "" : "s"}
        </div>
        {visibleMembers.length > 5 && (
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

      {!membersListVisible && !isStaff && hiddenCount > 0 && (
        <p className="mb-3 flex items-center gap-1.5 text-[12px] text-text3">
          <IconLock size={13} />
          The owner has hidden the rest of the member list ({hiddenCount} more).
        </p>
      )}

      {error && <p className="mb-2 text-[12px] text-pink">{error}</p>}

      {query && canLoadMore && (
        <p className="mb-2 text-[11px] text-text3">Searching the {loadedMembers.length} loaded so far -- load more to search further.</p>
      )}

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-text3">No members match “{query}”.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
          {filtered.map((m) => {
            const name = m.profiles?.display_name ?? "Member";
            // communities.owner_id is authoritative -- always show "Owner"
            // for that user regardless of what their (separate, mutable)
            // community_members.role row currently says. "Admin" is this
            // app's user-facing label for the 'moderator' role -- the
            // underlying column/RLS/actions all still say 'moderator'.
            const rawRole = m.user_id === ownerId ? "owner" : m.role;
            const displayRole = rawRole === "moderator" ? "Admin" : rawRole.charAt(0).toUpperCase() + rawRole.slice(1);
            const canRemove = isStaff && m.user_id !== ownerId && m.user_id !== currentUserId;
            const canToggleAdmin = isOwner && m.user_id !== ownerId;

            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/profile/${m.user_id}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-tint text-[11px] font-bold text-green">
                  {name.charAt(0).toUpperCase()}
                </Link>
                <Link href={`/profile/${m.user_id}`} className="min-w-0 flex-1 truncate text-[13px] text-text hover:text-green hover:underline">
                  {name}
                  {displayRole !== "Member" && <span className="ml-2 font-semibold text-green">· {displayRole}</span>}
                </Link>

                <div className="flex shrink-0 items-center gap-2">
                  {canToggleAdmin &&
                    (m.role === "moderator" ? (
                      <button
                        onClick={() => handleRoleChange(m.user_id, "member")}
                        disabled={rolePendingId === m.user_id}
                        aria-label={`Remove admin from ${name}`}
                        title="Remove admin"
                        className="shrink-0 text-green transition hover:text-text3 disabled:opacity-40"
                      >
                        <IconShieldMinus size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRoleChange(m.user_id, "moderator")}
                        disabled={rolePendingId === m.user_id}
                        aria-label={`Make ${name} an admin`}
                        title="Make admin"
                        className="shrink-0 text-text3 transition hover:text-green disabled:opacity-40"
                      >
                        <IconShieldPlus size={16} />
                      </button>
                    ))}

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
              </div>
            );
          })}
        </div>
      )}

      {canLoadMore && !query && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-card-sm border border-border2 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : `Load ${Math.min(50, totalCount - loadedMembers.length)} more`}
        </button>
      )}
    </div>
  );
}
