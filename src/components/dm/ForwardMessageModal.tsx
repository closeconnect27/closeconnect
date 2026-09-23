"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

type OtherProfile = { id: string; display_name: string; avatar_url: string | null };
type ThreadOption = { id: string; other: OtherProfile };

// "Forward message" -- forwards one or more messages' TEXT into one of the
// sender's own other profile-DM threads. Text only, deliberately: an
// attachment's storage path lives under its ORIGINAL thread's folder
// (dm/profile/{threadId}/...), and that thread's storage RLS policy only
// admits participants of THAT thread -- copying the row into a different
// thread would leave the new thread's other participant unable to fetch
// the file, so this sidesteps that rather than shipping a forward button
// that silently breaks for the recipient. Mirrors mobile's own
// ForwardMessageModal. `content` accepts an array for the multiselect bulk
// case -- each string becomes its own row, inserted in order.
export function ForwardMessageModal({
  content,
  currentThreadId,
  currentUserId,
  onClose,
}: {
  content: string | string[];
  currentThreadId: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const [threads, setThreads] = useState<ThreadOption[] | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profile_dm_threads")
      .select(
        "id, status, requester_id, recipient_id, " +
          "requester:profiles!profile_dm_threads_requester_id_fkey(id,display_name,avatar_url), " +
          "recipient:profiles!profile_dm_threads_recipient_id_fkey(id,display_name,avatar_url)",
      )
      .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .neq("status", "declined")
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as Array<{
          id: string;
          status: string;
          requester_id: string;
          recipient_id: string;
          requester: OtherProfile | null;
          recipient: OtherProfile | null;
        }>;
        const options: ThreadOption[] = rows
          .filter((r) => r.id !== currentThreadId && (r.status === "accepted" || r.requester_id === currentUserId))
          .map((r) => ({
            id: r.id,
            other: (r.requester_id === currentUserId ? r.recipient : r.requester) ?? { id: "", display_name: "Someone", avatar_url: null },
          }));
        setThreads(options);
      });
  }, [currentUserId, currentThreadId]);

  async function handleSendTo(threadId: string) {
    setSendingTo(threadId);
    const supabase = createClient();
    const contents = Array.isArray(content) ? content : [content];
    let failed = false;
    for (const text of contents) {
      const { error } = await supabase.from("profile_dm_messages").insert({ thread_id: threadId, sender_id: currentUserId, content: text });
      if (error) {
        failed = true;
        break;
      }
    }
    setSendingTo(null);
    if (!failed) setSentTo((prev) => new Set(prev).add(threadId));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-sm overflow-hidden rounded-t-card border border-border bg-bg2 sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <span className="font-heading text-[14px] font-bold text-text">Forward to…</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text3 hover:text-text2">
            <IconX size={18} />
          </button>
        </div>
        {threads === null ? (
          <p className="px-4 py-8 text-center text-[13px] text-text3">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text3">No other conversations to forward to yet.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto py-1.5">
            {threads.map((t) => {
              const done = sentTo.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => !done && handleSendTo(t.id)}
                  disabled={sendingTo === t.id || done}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-bg3 disabled:cursor-default"
                >
                  <ThreadAvatar name={t.other.display_name} avatarUrl={t.other.avatar_url} />
                  <span className="flex-1 truncate text-[14px] font-semibold text-text">{t.other.display_name}</span>
                  {sendingTo === t.id ? (
                    <span className="text-[12px] text-text3">Sending…</span>
                  ) : done ? (
                    <span className="text-[12px] font-semibold text-green">Sent</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
    return <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
