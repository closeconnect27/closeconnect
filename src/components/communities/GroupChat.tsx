"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  IconSend2,
  IconMessageCircle2,
  IconPaperclip,
  IconCamera,
  IconX,
  IconFile,
  IconLoader2,
  IconDownload,
  IconSpeakerphone,
  IconTrash,
  IconMicrophone,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markGroupRead, deleteMessage } from "@/app/actions/chat";
import { uploadChatAttachment, uploadVoiceNote, type ChatAttachment } from "@/lib/uploadChatAttachment";
import { resolveAttachmentUrl } from "@/lib/resolveAttachmentUrl";
import { useVoiceRecorder, formatDuration } from "@/lib/voiceRecording";
import { EmptyState } from "@/components/ui/EmptyState";
import { Linkify } from "@/components/ui/Linkify";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
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
    new Map(
      initialMessages.map((m) => [
        m.user_id,
        { display_name: m.profiles?.display_name ?? "member", avatar_url: m.profiles?.avatar_url ?? null },
      ]),
    ),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const recorder = useVoiceRecorder();

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
            attachment_type: "image" | "video" | "file" | "voice" | null;
            attachment_duration_seconds: number | null;
            attachment_name: string | null;
            event_id: string | null;
            post_id: string | null;
          };
          const cached = profileCache.current.get(row.user_id);
          let profile = cached ?? { display_name: "member", avatar_url: null };
          if (!cached) {
            const { data } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", row.user_id)
              .single();
            profile = {
              display_name: (data?.display_name as string | undefined) ?? "member",
              avatar_url: (data?.avatar_url as string | null | undefined) ?? null,
            };
            profileCache.current.set(row.user_id, profile);
          }
          const attachment_url = row.attachment_path ? await resolveAttachmentUrl(supabase, row.attachment_path) : null;
          // Realtime's payload.new is the raw row only, no joins -- a
          // second lookup for the event summary, same reasoning as the
          // attachment_url resolution just above it.
          let event: ChatMessage["event"] = null;
          if (row.event_id) {
            const { data } = await supabase
              .from("events")
              .select("id,event_name,event_date,event_time,city,category,unsplash_image_url")
              .eq("id", row.event_id)
              .maybeSingle();
            event = data as ChatMessage["event"];
          }
          let post: ChatMessage["post"] = null;
          if (row.post_id) {
            const { data } = await supabase
              .from("community_posts")
              .select("id,content,image_path,image_paths")
              .eq("id", row.post_id)
              .maybeSingle();
            post = data as ChatMessage["post"];
          }
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, attachment_url, event, post, profiles: profile }],
          );
          markGroupRead(groupId).catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "community_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
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

  async function handleStartRecording() {
    setError("");
    try {
      await recorder.start();
    } catch {
      setError("Microphone permission was denied.");
    }
  }

  function handleCancelRecording() {
    recorder.cancel();
  }

  async function handleStopAndSendRecording() {
    const result = await recorder.stop();
    if (!result) return;
    setUploadingAttachment(true);
    setError("");
    const { attachment, error: uploadError } = await uploadVoiceNote(result.blob, groupId, result.durationSeconds);
    setUploadingAttachment(false);
    if (uploadError || !attachment) {
      setError(uploadError ?? "Couldn't send that voice message.");
      return;
    }
    startTransition(async () => {
      const sendResult = await sendMessage(groupId, "", attachment);
      if (sendResult.error) setError(sendResult.error);
      else setCooldown(UI_COOLDOWN_SECONDS);
    });
  }

  function handleDelete(messageId: string) {
    setError("");
    const previous = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    startTransition(async () => {
      const result = await deleteMessage(messageId);
      if (result.error) {
        setError(result.error);
        setMessages(previous);
      }
    });
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
    // flex-1 (filling the page's own flex-1 chain down from SiteChrome),
    // not a fixed h-[70vh] -- that left dead space below the chat box on
    // most screens and didn't actually use the full page the way a native
    // chat thread view does.
    <div className="card-elevated flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-bg2">
      <div className="flex flex-1 flex-col justify-end gap-2 overflow-y-auto bg-bg p-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={IconMessageCircle2} title="No messages yet" description="Say hello!" compact />
          </div>
        ) : (
          messages.map((m) => {
            if (m.event) return <EventBroadcastCard key={m.id} event={m.event} />;
            if (m.post) return <PostBroadcastCard key={m.id} post={m.post} supabase={supabase} />;

            const isMine = m.user_id === currentUserId;
            const name = m.profiles?.display_name ?? "member";
            const time = formatMessageTime(m.created_at);
            return (
              <div key={m.id} className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                <div className={`mb-1 flex items-baseline gap-1.5 px-1 ${isMine ? "flex-row-reverse" : ""}`}>
                  {!isMine && (
                    <Link
                      href={`/profile/${m.user_id}`}
                      className="text-[11px] font-medium text-text3 transition hover:text-green hover:underline"
                    >
                      {name}
                    </Link>
                  )}
                  <span className="text-[10px] text-text3/70">{time}</span>
                </div>
                <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : ""}`}>
                  <MessageAvatar name={name} avatarUrl={m.profiles?.avatar_url ?? null} />
                  <div
                    className={`inline-block max-w-[75%] overflow-hidden rounded-2xl text-[14px] leading-relaxed ${
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
                  {isMine && (
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      aria-label="Delete message"
                      className="shrink-0 self-center p-1 text-text3 opacity-0 transition hover:text-pink group-hover:opacity-100"
                    >
                      <IconTrash size={14} />
                    </button>
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
          {recorder.isRecording ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelRecording}
                aria-label="Cancel recording"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border2 text-pink transition hover:border-pink"
              >
                <IconTrash size={18} />
              </button>
              <div className="flex flex-1 items-center gap-2 rounded-full border border-border2 bg-bg3 px-4 py-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-pink" />
                <span className="font-mono text-[14px] font-semibold text-text">{formatDuration(recorder.currentTime)}</span>
              </div>
              <button
                type="button"
                onClick={handleStopAndSendRecording}
                disabled={uploadingAttachment}
                aria-label="Send voice message"
                className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-[12px]"
              >
                {uploadingAttachment ? <IconLoader2 size={18} className="animate-spin" /> : <IconSend2 size={18} />}
              </button>
            </div>
          ) : (
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
            {/* Separate from the generic attach button above: `capture`
                explicitly tells the OS to open the camera app directly
                (not just offer it as one option in a generic file
                chooser, which some Android WebView versions skip
                entirely for a bare accept="image/*" input). */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAttachmentPick(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploadingAttachment || !!attachment}
              aria-label="Take a photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-50"
            >
              <IconCamera size={18} />
            </button>
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Message…"
              maxLength={1000}
              className="flex-1 rounded-full border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            {!content.trim() && !attachment ? (
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={cooldown > 0}
                aria-label="Record a voice message"
                className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-[12px]"
              >
                {cooldown > 0 ? cooldown : <IconMicrophone size={18} />}
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending || cooldown > 0 || uploadingAttachment}
                aria-label="Send message"
                className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-[12px]"
              >
                {cooldown > 0 ? cooldown : <IconSend2 size={18} />}
              </button>
            )}
          </div>
          )}
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

// Auto-posted by broadcast_new_community_event() (0076) whenever the
// community publishes a new event -- rendered as its own card rather than
// a chat bubble so it reads as an announcement, not something someone
// typed. Centered/full-width, not left/right-aligned like a bubble, since
// it isn't really "from" the host in the same sense a message is.
function EventBroadcastCard({ event }: { event: NonNullable<ChatMessage["event"]> }) {
  const visual = getCategoryVisual(event.category ?? "other");
  return (
    <Link
      href={`/events/${event.id}`}
      className="card-elevated block overflow-hidden rounded-card border border-border2 bg-bg2 transition hover:border-green"
    >
      <div className="relative h-28 w-full" style={{ background: visual.bg }}>
        <CategoryImage
          slug={event.category ?? "other"}
          seed={communitySeed(event.id)}
          unsplashImageUrl={event.unsplash_image_url}
          alt=""
          fill
          sizes="400px"
          className="object-cover"
        />
      </div>
      <div className="flex items-center gap-1.5 px-4 pt-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-pink-neon">
        <IconSpeakerphone size={13} />
        New event
      </div>
      <div className="px-4 pb-3 pt-1">
        <div className="text-[14px] font-bold text-text">{event.event_name}</div>
        <div className="mt-0.5 text-[12px] text-text2">
          {formatBroadcastEventDate(event.event_date)}
          {event.city ? ` · ${event.city}` : ""}
        </div>
      </div>
    </Link>
  );
}

// Auto-posted by broadcast_new_community_post() (0112) whenever the
// community's staff publishes a new feed post -- same "announcement card,
// not a chat bubble" treatment as EventBroadcastCard above. content is
// truncated to a short snippet since a post's full body belongs on its own
// page, not crammed into a chat card.
function PostBroadcastCard({ post, supabase }: { post: NonNullable<ChatMessage["post"]>; supabase: ReturnType<typeof createClient> }) {
  const paths = post.image_paths && post.image_paths.length > 0 ? post.image_paths : post.image_path ? [post.image_path] : [];
  const imageUrl = paths.length > 0 ? supabase.storage.from("community-post-images").getPublicUrl(paths[0]).data.publicUrl : null;
  const snippet = post.content.length > 140 ? `${post.content.slice(0, 140)}…` : post.content;
  return (
    <Link
      href={`/feed/${post.id}`}
      className="card-elevated block overflow-hidden rounded-card border border-border2 bg-bg2 transition hover:border-green"
    >
      {imageUrl && (
        <div className="relative h-28 w-full bg-bg3">
          {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary post image path, same escape hatch as profile avatars (next/image's host allowlist doesn't cover it) */}
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-1.5 px-4 pt-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-pink-neon">
        <IconSpeakerphone size={13} />
        New post
      </div>
      <div className="px-4 pb-3 pt-1 text-[13px] text-text2">{snippet}</div>
    </Link>
  );
}

// Parsed as a plain calendar date, not a Date-with-timezone -- same
// reasoning as EventCard's formatDateChip.
function formatBroadcastEventDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatMessageTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

// Same image-or-initials pattern as IncomingFollowRequests -- one small
// avatar per message, not just on hover-only own messages, so every bubble
// (own or others') reads as coming from someone instead of floating alone.
function MessageAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
    return <img src={avatarUrl} alt="" className="mb-0.5 h-6 w-6 shrink-0 self-end rounded-full object-cover" />;
  }
  return (
    <span className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-full bg-green-tint text-[10px] font-bold text-green">
      {name.charAt(0).toUpperCase()}
    </span>
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

  if (message.attachment_type === "voice") {
    return (
      <div className="px-3 py-2">
        <audio src={message.attachment_url} controls className="h-9 w-56 max-w-full" />
      </div>
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
