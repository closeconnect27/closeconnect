"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { IconSend2, IconMessageCircle2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/app/actions/chat";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ChatMessage } from "@/lib/queries/chat";

// Client-side cooldown is UX only -- the real limit is the DB trigger
// (enforce_chat_rate_limit), which is what actually stops abuse regardless
// of which client calls the API. 3s of UI cooldown against the trigger's 2s
// window leaves margin so a slightly-early resend from clock drift doesn't
// bounce off the trigger and show a confusing error.
const UI_COOLDOWN_SECONDS = 3;

export function GroupChat({
  groupId,
  initialMessages,
  currentUserId,
  canPost,
}: {
  groupId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
  canPost: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const profileCache = useRef(
    new Map(initialMessages.map((m) => [m.user_id, m.profiles?.display_name ?? "member"])),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            group_id: string;
            user_id: string;
            content: string;
            created_at: string;
          };
          const cached = profileCache.current.get(row.user_id);
          let displayName: string = cached ?? "member";
          if (!cached) {
            const { data } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", row.user_id)
              .single();
            displayName = (data?.display_name as string | undefined) ?? "member";
            profileCache.current.set(row.user_id, displayName);
          }
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [...prev, { ...row, profiles: { display_name: displayName } }],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || cooldown > 0 || pending) return;
    setError("");
    const text = content;
    setContent("");
    startTransition(async () => {
      const result = await sendMessage(groupId, text);
      if (result.error) {
        setError(result.error);
        setContent(text);
      } else {
        setCooldown(UI_COOLDOWN_SECONDS);
      }
    });
  }

  return (
    <div className="card-elevated flex h-[70vh] flex-col overflow-hidden rounded-card bg-bg2">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-bg p-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={IconMessageCircle2} title="No messages yet" description="Say hello!" compact />
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.user_id === currentUserId;
            return (
              <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                {!isMine && (
                  <span className="mb-1 px-1 text-[11px] font-medium text-text3">
                    {m.profiles?.display_name ?? "member"}
                  </span>
                )}
                <span
                  className={`inline-block max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                    isMine
                      ? "rounded-br-sm bg-green text-green-dark"
                      : "rounded-bl-sm bg-bg2 text-text shadow-card"
                  }`}
                >
                  {m.content}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {canPost ? (
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
            disabled={pending || cooldown > 0 || !content.trim()}
            aria-label="Send message"
            className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-[12px]"
          >
            {cooldown > 0 ? cooldown : <IconSend2 size={18} />}
          </button>
        </form>
      ) : (
        <p className="border-t border-border bg-bg2 px-4 py-3 text-center text-[12px] text-text3">
          Only the owner and moderators can post here.
        </p>
      )}
      {error && <p className="border-t border-border px-4 py-2 text-[12px] text-pink">{error}</p>}
    </div>
  );
}
