"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { IconX, IconSend2, IconMessageCircle2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { sendCommunityDm, replyToCommunityDm } from "@/app/actions/dm";
import { EmptyState } from "@/components/ui/EmptyState";
import { Linkify } from "@/components/ui/Linkify";
import type { DmMessage } from "@/lib/queries/dm";

// Shared by both sides of "Reach out to admin" -- a member's own thread
// (mode="member", ReachOutButton) and staff replying into a specific
// member's thread (mode="staff", DmInboxSection). Text-only, no
// attachments -- the request was for a plain "typebox to type messages to
// and fro", not a full chat feature; GroupChat.tsx's attachment handling
// would be scope creep here.
export function DmModal({
  communityId,
  threadId: initialThreadId,
  initialMessages,
  currentUserId,
  otherPartyName,
  mode,
  onClose,
}: {
  communityId: string;
  threadId: string | null;
  initialMessages: DmMessage[];
  currentUserId: string;
  otherPartyName: string;
  mode: "member" | "staff";
  onClose: () => void;
}) {
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`dm-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as DmMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || pending) return;
    setError("");
    const text = content;
    setContent("");
    startTransition(async () => {
      // Handled as two entirely separate branches, not a ternary merging
      // both calls into one `result` variable -- sendCommunityDm's success
      // shape carries a threadId (the thread may not have existed until
      // this message created it) and replyToCommunityDm's doesn't (it
      // always replies into an already-known thread), and TypeScript can't
      // cleanly narrow that difference back out of a merged union.
      if (mode === "member") {
        const result = await sendCommunityDm(communityId, text);
        // !== null, not a plain truthy check -- error's type is `string`
        // in the failure branch (which TS can't treat as "always truthy",
        // an empty string is still a valid string), so only an explicit
        // null-equality check lets TS discriminate the union and narrow
        // result.threadId to `string` below rather than `string | undefined`.
        if (result.error !== null) {
          setError(result.error);
          setContent(text);
          return;
        }
        setThreadId(result.threadId);
      } else {
        const result = await replyToCommunityDm(communityId, threadId!, text);
        if (result.error !== null) {
          setError(result.error);
          setContent(text);
          return;
        }
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[70vh] w-full max-w-[440px] flex-col overflow-hidden rounded-card bg-bg2 shadow-card-hover">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <span className="font-heading text-[14px] font-bold">{otherPartyName}</span>
          <button onClick={onClose} className="text-text2 transition hover:text-text">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={IconMessageCircle2} title="No messages yet" description="Say hello!" compact />
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  <div
                    className={`inline-block max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                      isMine ? "rounded-br-sm bg-green text-green-dark" : "rounded-bl-sm bg-bg2 text-text shadow-card"
                    }`}
                  >
                    <Linkify text={m.content} />
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-3 border-t border-border bg-bg2 p-4">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Message…"
            maxLength={1000}
            className="flex-1 rounded-full border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
          />
          <button
            type="submit"
            disabled={pending || !content.trim()}
            aria-label="Send message"
            className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0"
          >
            <IconSend2 size={18} />
          </button>
        </form>
        {error && <p className="border-t border-border px-4 py-2 text-[12px] text-pink">{error}</p>}
      </div>
    </div>
  );
}
