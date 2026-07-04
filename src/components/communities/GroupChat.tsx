"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/app/actions/chat";
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
}: {
  groupId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
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
    <div className="flex h-[70vh] flex-col rounded-card border border-border bg-bg2">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const isMine = m.user_id === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
              <span className="mb-0.5 text-[10px] text-text3">
                {m.profiles?.display_name ?? "member"}
              </span>
              <span
                className={`inline-block max-w-[80%] rounded-card-sm px-3 py-2 text-[14px] ${
                  isMine ? "bg-green text-green-dark" : "bg-bg3 text-text"
                }`}
              >
                {m.content}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 border-t border-border p-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Message…"
          maxLength={1000}
          className="flex-1 rounded-full border border-border2 bg-bg3 px-4 py-2 text-[14px]"
        />
        <button
          type="submit"
          disabled={pending || cooldown > 0 || !content.trim()}
          className="rounded-full bg-green px-4 py-2 text-[13px] font-bold text-green-dark disabled:opacity-40"
        >
          {cooldown > 0 ? `${cooldown}s` : "Send"}
        </button>
      </form>
      {error && <p className="px-3 pb-2 text-[12px] text-pink">{error}</p>}
    </div>
  );
}
