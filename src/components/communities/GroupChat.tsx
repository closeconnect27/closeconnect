"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  IconSend2,
  IconMessageCircle2,
  IconPaperclip,
  IconX,
  IconFile,
  IconLoader2,
  IconDownload,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markGroupRead } from "@/app/actions/chat";
import { uploadChatAttachment, type ChatAttachment } from "@/lib/uploadChatAttachment";
import { resolveAttachmentUrl } from "@/lib/resolveAttachmentUrl";
import { EmptyState } from "@/components/ui/EmptyState";
import { Linkify } from "@/components/ui/Linkify";
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
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const profileCache = useRef(
    new Map(initialMessages.map((m) => [m.user_id, m.profiles?.display_name ?? "member"])),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Opening this chat is a read of everything already here; the realtime
  // handler below marks it again for anything that arrives afterward, so
  // the badge on the groups list never shows unread for the chat the
  // viewer currently has open.
  useEffect(() => {
    markGroupRead(groupId).catch(() => {});
  }, [groupId]);

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
            content: string | null;
            created_at: string;
            attachment_path: string | null;
            attachment_type: "image" | "video" | "file" | null;
            attachment_name: string | null;
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
          const attachment_url = row.attachment_path ? await resolveAttachmentUrl(supabase, row.attachment_path) : null;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [...prev, { ...row, attachment_url, profiles: { display_name: displayName } }],
          );
          markGroupRead(groupId).catch(() => {});
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

  async function handleAttachmentPick(file: File) {
    setError("");
    setUploadingAttachment(true);
    const result = await uploadChatAttachment(file, groupId);
    setUploadingAttachment(false);
    if (result.error) setError(result.error);
    else setAttachment(result.attachment);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if ((!content.trim() && !attachment) || cooldown > 0 || pending || uploadingAttachment) return;
    setError("");
    const text = content;
    const sentAttachment = attachment;
    setContent("");
    setAttachment(null);
    startTransition(async () => {
      const result = await sendMessage(groupId, text, sentAttachment ?? undefined);
      if (result.error) {
        setError(result.error);
        setContent(text);
        setAttachment(sentAttachment);
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
                  <Link
                    href={`/profile/${m.user_id}`}
                    className="mb-1 px-1 text-[11px] font-medium text-text3 transition hover:text-green hover:underline"
                  >
                    {m.profiles?.display_name ?? "member"}
                  </Link>
                )}
                <div
                  className={`inline-block max-w-[80%] overflow-hidden rounded-2xl text-[14px] leading-relaxed ${
                    isMine ? "rounded-br-sm bg-green text-green-dark" : "rounded-bl-sm bg-bg2 text-text shadow-card"
                  } ${m.attachment_type ? "" : "px-4 py-2.5"}`}
                >
                  <MessageAttachment message={m} />
                  {m.content && (
                    <div className={m.attachment_type ? "px-4 py-2.5" : ""}>
                      <Linkify text={m.content} />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {canPost ? (
        <form onSubmit={handleSend} className="flex flex-col gap-2 border-t border-border bg-bg2 p-4">
          {attachment && (
            <div className="flex items-center gap-2 rounded-card-sm border border-border2 bg-bg3 px-3 py-2 text-[12px] text-text2">
              {attachment.type === "file" ? <IconFile size={14} /> : null}
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="text-text3 hover:text-pink">
                <IconX size={14} />
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,.zip,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAttachmentPick(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAttachment || !!attachment}
              aria-label="Attach a file"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-50"
            >
              {uploadingAttachment ? <IconLoader2 size={18} className="animate-spin" /> : <IconPaperclip size={18} />}
            </button>
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Message…"
              maxLength={1000}
              className="flex-1 rounded-full border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            <button
              type="submit"
              disabled={pending || cooldown > 0 || uploadingAttachment || (!content.trim() && !attachment)}
              aria-label="Send message"
              className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-[12px]"
            >
              {cooldown > 0 ? cooldown : <IconSend2 size={18} />}
            </button>
          </div>
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

function MessageAttachment({ message }: { message: ChatMessage }) {
  if (!message.attachment_type || !message.attachment_url) return null;

  if (message.attachment_type === "image") {
    return (
      <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static remote pattern next/image can optimize */}
        <img src={message.attachment_url} alt="" className="max-h-64 w-full object-cover" />
      </a>
    );
  }

  if (message.attachment_type === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded chat clips, no caption track exists to provide
      <video src={message.attachment_url} controls className="max-h-64 w-full" />
    );
  }

  return (
    <a
      href={message.attachment_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 px-4 py-2.5 underline-offset-2 hover:underline"
    >
      <IconFile size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{message.attachment_name ?? "File"}</span>
      <IconDownload size={14} className="shrink-0" />
    </a>
  );
}
