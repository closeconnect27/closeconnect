"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { unblockUser } from "@/app/actions/block";
import type { FollowListEntry } from "@/lib/queries/profileDetails";

export function UnblockRow({ person }: { person: FollowListEntry }) {
  const router = useRouter();
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleUnblock() {
    setError("");
    setRemoved(true);
    startTransition(async () => {
      const result = await unblockUser(person.id);
      if (result?.error) {
        setError(result.error);
        setRemoved(false);
      } else {
        router.refresh();
      }
    });
  }

  if (removed) return null;

  return (
    <div className="flex items-center gap-3 rounded-card bg-bg2 p-3">
      <Link href={`/profile/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {person.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
          <img src={person.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
            {person.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="truncate text-[13px] font-medium text-text">{person.display_name}</span>
      </Link>
      <button onClick={handleUnblock} disabled={pending} className="btn-secondary shrink-0 px-3 py-1.5 text-[12px]">
        Unblock
      </button>
      {error && <p className="text-[11px] text-pink">{error}</p>}
    </div>
  );
}
