"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconMessageCircle2, IconInbox, IconSearch, IconTrash } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { getOtherParticipant } from "@/lib/queries/profileDm";
import { isThreadUnread } from "@/lib/queries/dmReads";
import { deleteProfileDmChat, startOrGetProfileDmThread } from "@/app/actions/profileDm";
import type { ProfileDmThreadSummary } from "@/lib/queries/profileDm";

type Tab = "primary" | "requests";

// A platform user found via the "People" search below, distinct from a
// ProfileDmThreadSummary -- there's no thread (or we haven't bothered
// checking) between the viewer and this person yet.
type PlatformPerson = { id: string; display_name: string; avatar_url: string | null; username: string | null };

// Only bother hitting `profiles` once the in-memory thread search is coming
// up short -- if someone's already found 3+ matching conversations, they
// almost certainly don't also need the platform-wide list.
const FEW_THREAD_MATCHES = 3;
const MIN_QUERY_LEN = 2;
const SEARCH_DEBOUNCE_MS = 300;

// Instagram-style split: Primary is everything the viewer has already let
// in (accepted threads, or a request they themselves sent and are still
// waiting on) -- Requests is only incoming pending requests, the ones that
// actually need a decision from this viewer. A thread never appears in
// both.
export function MessagesInbox({
  threads,
  currentUserId,
  readTimestamps,
}: {
  threads: ProfileDmThreadSummary[];
  currentUserId: string;
  readTimestamps: Map<string, string>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("primary");
  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [people, setPeople] = useState<PlatformPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [startingDmId, setStartingDmId] = useState<string | null>(null);
  const [dmError, setDmError] = useState("");
  const [, startDmTransition] = useTransition();

  function handleDeleteChat(e: React.MouseEvent, threadId: string, otherName: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete your copy of the conversation with ${otherName}? It comes back if they message you again.`)) return;
    setHiddenIds((prev) => new Set(prev).add(threadId));
    startTransition(async () => {
      await deleteProfileDmChat(threadId);
    });
  }

  const requests = threads.filter((t) => t.status === "pending" && t.recipient_id === currentUserId && !hiddenIds.has(t.id));
  const primary = threads.filter((t) => (t.status === "accepted" || t.requester_id === currentUserId) && !hiddenIds.has(t.id));

  const requestsUnread = requests.length; // every incoming request is, by definition, awaiting this viewer
  const primaryUnread = primary.filter((t) =>
    isThreadUnread(t.last_message_at, t.last_message_sender_id, currentUserId, readTimestamps.get(t.id)),
  ).length;

  const query = search.trim().toLowerCase();
  const list = (tab === "primary" ? primary : requests).filter((t) => {
    if (!query) return true;
    const other = getOtherParticipant(t, currentUserId);
    return other.display_name.toLowerCase().includes(query) || (t.last_message_content ?? "").toLowerCase().includes(query);
  });

  // Platform-wide "People" search: existing-thread search above only ever
  // looks at threads already loaded into this inbox, so someone you've
  // never messaged (no thread yet) was previously unfindable no matter how
  // exactly you typed their name. Debounced since, unlike the in-memory
  // filter above, this is a real network query on every change.
  useEffect(() => {
    if (query.length < MIN_QUERY_LEN || list.length >= FEW_THREAD_MATCHES) {
      setPeople([]);
      setPeopleLoading(false);
      setPeopleError("");
      return;
    }

    let cancelled = false;
    setPeopleLoading(true);
    setPeopleError("");
    const timer = setTimeout(async () => {
      const supabase = createClient();
      // `,` and `(`/`)` are structural in PostgREST's .or() filter syntax --
      // strip them so a search containing them can't break the query.
      const safe = query.replace(/[,()]/g, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, username")
        .neq("id", currentUserId)
        .or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%`)
        .limit(8);

      if (cancelled) return;
      setPeopleLoading(false);
      if (error || !data) {
        // Previously swallowed silently (setPeople([])) -- indistinguishable
        // from "no one matched," which is exactly what made "search doesn't
        // work" impossible to diagnose from a bug report alone. Now visible.
        setPeople([]);
        setPeopleError(error?.message || "Couldn't search right now.");
        return;
      }
      // Don't show someone twice -- once in the thread list above and again
      // down here -- if they already have a matching thread.
      const alreadyShown = new Set(list.map((t) => getOtherParticipant(t, currentUserId).id));
      setPeople((data as PlatformPerson[]).filter((p) => !alreadyShown.has(p.id)));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // list is intentionally read via closure, not listed as a dep -- it's a
    // new array every render; re-running on its *length* (below) is enough
    // to keep the exclusion set and threshold check current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, currentUserId, list.length]);

  function handleStartDm(person: PlatformPerson) {
    setDmError("");
    setStartingDmId(person.id);
    startDmTransition(async () => {
      const result = await startOrGetProfileDmThread(person.id);
      setStartingDmId(null);
      if (result.error || !result.threadId) {
        setDmError(result.error ?? "Could not start this conversation");
        return;
      }
      router.push(`/messages/${result.threadId}`);
    });
  }

  return (
    <div>
      <div className="relative mb-3">
        <IconSearch size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people or chats…"
          className="w-full rounded-full border border-border2 bg-bg3 py-2 pl-9 pr-4 text-[13px] text-text outline-none transition focus:border-green"
        />
      </div>

      <div role="tablist" className="mb-4 flex gap-1 rounded-full border border-border2 bg-bg3 p-1">
        <TabButton label="Messages" active={tab === "primary"} count={primaryUnread} onClick={() => setTab("primary")} />
        <TabButton label="Requests" active={tab === "requests"} count={requestsUnread} onClick={() => setTab("requests")} />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === "primary" ? IconMessageCircle2 : IconInbox}
          title={tab === "primary" ? "No messages yet" : "No message requests"}
          description={tab === "primary" ? "Start a conversation from someone's profile." : "Requests from people you don't follow back show up here."}
        />
      ) : (
        <div className="card-elevated overflow-hidden rounded-card bg-bg2">
          <div className="divide-y divide-border">
            {list.map((t) => {
              const other = getOtherParticipant(t, currentUserId);
              const unread = isThreadUnread(t.last_message_at, t.last_message_sender_id, currentUserId, readTimestamps.get(t.id));
              const isRequester = t.requester_id === currentUserId;
              return (
                <div key={t.id} className="group relative flex items-center">
                  <Link href={`/messages/${t.id}`} className="flex flex-1 items-center gap-3 py-4 pl-4 pr-10 transition hover:bg-bg3">
                    <ThreadAvatar name={other.display_name} avatarUrl={other.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green" />}
                        <span className="truncate text-[14px] font-semibold text-text">{other.display_name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-text3">
                        {t.status === "pending" && isRequester
                          ? "Request sent"
                          : (t.last_message_content ?? "Say hello!")}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-text3">{formatRelativeTime(t.last_message_at)}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteChat(e, t.id, other.display_name)}
                    aria-label="Delete chat"
                    className="absolute right-3 shrink-0 rounded-full p-1.5 text-text3 opacity-0 transition hover:text-pink group-hover:opacity-100"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {query.length >= MIN_QUERY_LEN && (peopleLoading || people.length > 0 || peopleError) && (
        <div className="mt-4">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-text3">People</p>
          {dmError && <p className="mb-2 px-1 text-[12px] text-pink">{dmError}</p>}
          {peopleLoading ? (
            <p className="px-1 text-[12px] text-text3">Searching…</p>
          ) : peopleError ? (
            <p className="px-1 text-[12px] text-pink">{peopleError}</p>
          ) : (
            <div className="card-elevated overflow-hidden rounded-card bg-bg2">
              <div className="divide-y divide-border">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={startingDmId === p.id}
                    onClick={() => handleStartDm(p)}
                    className="flex w-full items-center gap-3 py-4 pl-4 pr-4 text-left transition hover:bg-bg3 disabled:opacity-60"
                  >
                    <ThreadAvatar name={p.display_name} avatarUrl={p.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-text">{p.display_name}</span>
                      {p.username && <span className="block truncate text-[12px] text-text3">@{p.username}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "flex-1 shrink-0 rounded-full bg-green px-4 py-2 text-[13px] font-bold text-green-dark transition"
          : "flex-1 shrink-0 rounded-full px-4 py-2 text-[13px] font-medium text-text2 transition hover:text-text"
      }
    >
      {label}
      {count > 0 ? ` (${count > 9 ? "9+" : count})` : ""}
    </button>
  );
}

function ThreadAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
    return <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-tint text-[16px] font-bold text-green">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatRelativeTime(iso: string) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
