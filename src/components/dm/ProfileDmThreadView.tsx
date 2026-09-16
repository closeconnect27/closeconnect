"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  IconSend2,
  IconMessageCircle2,
  IconPaperclip,
  IconCamera,
  IconX,
  IconFile,
  IconLoader2,
  IconDownload,
  IconTrash,
  IconArrowBackUp,
  IconGif,
  IconMicrophone,
} from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import {
  sendProfileDmMessage,
  acceptProfileDmThread,
  declineProfileDmThread,
  deleteProfileDmMessage,
} from "@/app/actions/profileDm";
import { markDmThreadRead } from "@/app/actions/dmReads";
import { uploadChatAttachment, uploadVoiceNote } from "@/lib/uploadChatAttachment";
import { resolveDmAttachmentUrl } from "@/lib/queries/profileDm";
import { useTypingIndicator } from "@/lib/typingIndicator";
import { useVoiceRecorder, formatDuration } from "@/lib/voiceRecording";
import { GifPicker } from "@/components/dm/GifPicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Linkify } from "@/components/ui/Linkify";
import type { ProfileDmMessage, ProfileDmAttachmentType } from "@/lib/queries/profileDm";
import type { GiphyResult } from "@/lib/giphy";

// Client-side cooldown is UX only, same reasoning as GroupChat's own --
// enforce_profile_dm_rate_limit (0123) is the real 2s backstop.
const UI_COOLDOWN_SECONDS = 3;
const TYPING_STOP_DELAY_MS = 2000;

type PendingAttachment = { path: string; type: ProfileDmAttachmentType; name: string; durationSeconds?: number };

type OtherParticipant = { id: string; display_name: string; avatar_url: string | null };

export function ProfileDmThreadView({
  threadId,
  currentUserId,
  otherParticipant,
  initialMessages,
  initialStatus,
  isRequester,
  initialOtherReadAt,
}: {
  threadId: string;
  currentUserId: string;
  otherParticipant: OtherParticipant;
  initialMessages: ProfileDmMessage[];
  initialStatus: "pending" | "accepted" | "declined";
  isRequester: boolean;
  initialOtherReadAt: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [otherReadAt, setOtherReadAt] = useState(initialOtherReadAt);
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [replyTo, setReplyTo] = useState<ProfileDmMessage | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [decisionPending, startDecisionTransition] = useTransition();
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const { otherTyping, sendTyping } = useTypingIndicator("profile", threadId, currentUserId);
  const recorder = useVoiceRecorder();

  // Opening a thread is a read of everything already here; the realtime
  // message handler below marks it again for anything that arrives while
  // it's open, same pattern as DmModal/GroupChat.
  useEffect(() => {
    markDmThreadRead("profile", threadId).catch(() => {});
  }, [threadId]);

  useEffect(() => {
    const channel = supabase
      .channel(`profile-dm-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profile_dm_messages", filter: `thread_id=eq.${threadId}` },
        async (payload) => {
          const row = payload.new as Omit<ProfileDmMessage, "attachment_url">;
          const attachment_url = await resolveDmAttachmentUrl(supabase, row.attachment_path, row.attachment_type);
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, attachment_url }]));
          if (row.sender_id !== currentUserId) markDmThreadRead("profile", threadId).catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profile_dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profile_dm_threads", filter: `id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as { status: "pending" | "accepted" | "declined" };
          setStatus(row.status);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_reads", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as { user_id: string; thread_kind: string; last_read_at: string } | null;
          if (row && row.thread_kind === "profile" && row.user_id === otherParticipant.id) {
            setOtherReadAt(row.last_read_at);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, supabase, currentUserId, otherParticipant.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function handleContentChange(value: string) {
    setContent(value);
    sendTyping(true);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => sendTyping(false), TYPING_STOP_DELAY_MS);
  }

  async function handleAttachmentPick(file: File) {
    setError("");
    setUploadingAttachment(true);
    const result = await uploadChatAttachment(file, `dm/profile/${threadId}`);
    setUploadingAttachment(false);
    if (result.error) setError(result.error);
    else if (result.attachment) setAttachment(result.attachment);
  }

  function handleGifSelect(gif: GiphyResult) {
    setAttachment({ path: gif.url, type: "gif", name: "GIF" });
    setGifPickerOpen(false);
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
    const { attachment: uploaded, error: uploadError } = await uploadVoiceNote(result.blob, `dm/profile/${threadId}`, result.durationSeconds);
    setUploadingAttachment(false);
    if (uploadError || !uploaded) {
      setError(uploadError ?? "Couldn't send that voice message.");
      return;
    }
    startTransition(async () => {
      const sendResult = await sendProfileDmMessage(threadId, {
        attachmentPath: uploaded.path,
        attachmentType: uploaded.type,
        attachmentName: uploaded.name,
        attachmentDurationSeconds: uploaded.durationSeconds,
      });
      if (sendResult.error) setError(sendResult.error);
      else setCooldown(UI_COOLDOWN_SECONDS);
    });
  }

  function handleDelete(messageId: string) {
    setError("");
    const previous = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    startTransition(async () => {
      const result = await deleteProfileDmMessage(messageId);
      if (result.error) {
        setError(result.error);
        setMessages(previous);
      }
    });
  }

  function handleAccept() {
    setError("");
    const previous = status;
    setStatus("accepted");
    startDecisionTransition(async () => {
      const result = await acceptProfileDmThread(threadId);
      if (result.error) {
        setError(result.error);
        setStatus(previous);
      }
    });
  }

  function handleDecline() {
    setError("");
    const previous = status;
    setStatus("declined");
    startDecisionTransition(async () => {
      const result = await declineProfileDmThread(threadId);
      if (result.error) {
        setError(result.error);
        setStatus(previous);
      }
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if ((!content.trim() && !attachment) || cooldown > 0 || pending || uploadingAttachment) return;
    setError("");
    const text = content;
    const sentAttachment = attachment;
    const sentReplyTo = replyTo;
    setContent("");
    setAttachment(null);
    setReplyTo(null);
    sendTyping(false);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    startTransition(async () => {
      const result = await sendProfileDmMessage(threadId, {
        content: text || undefined,
        attachmentPath: sentAttachment?.path,
        attachmentType: sentAttachment?.type,
        attachmentName: sentAttachment?.name,
        replyToMessageId: sentReplyTo?.id,
      });
      if (result.error) {
        setError(result.error);
        setContent(text);
        setAttachment(sentAttachment);
        setReplyTo(sentReplyTo);
      } else {
        setCooldown(UI_COOLDOWN_SECONDS);
      }
    });
  }

  const canCompose = status === "accepted" || (status === "pending" && isRequester);
  const lastMessage = messages[messages.length - 1];

  return (
    <div className="card-elevated flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-bg2">
      <div className="flex flex-1 flex-col justify-end gap-2 overflow-y-auto bg-bg p-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={IconMessageCircle2} title="No messages yet" description="Say hello!" compact />
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === currentUserId;
            const time = formatMessageTime(m.created_at);
            const repliedMessage = m.reply_to_message_id ? messages.find((x) => x.id === m.reply_to_message_id) : null;
            const isLastMine = isMine && m.id === lastMessage?.id;
            const showSeen = isLastMine && !!otherReadAt && otherReadAt >= m.created_at;

            return (
              <div key={m.id} className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                <div className="mb-1 px-1">
                  <span className="text-[10px] text-text3/70">{time}</span>
                </div>
                <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : ""}`}>
                  <MessageAvatar name={otherParticipant.display_name} avatarUrl={otherParticipant.avatar_url} show={!isMine} />
                  <div
                    className={`inline-block max-w-[75%] overflow-hidden rounded-2xl text-[14px] leading-relaxed ${
                      isMine ? "rounded-br-sm bg-green text-green-dark" : "rounded-bl-sm bg-bg2 text-text shadow-card"
                    } ${m.attachment_type ? "" : "px-4 py-2.5"}`}
                  >
                    {m.reply_to_message_id && (
                      <div className="mx-2.5 mt-2.5 rounded-card-sm border-l-2 border-current/40 bg-black/5 px-2 py-1 text-[12px] opacity-80">
                        {repliedMessage ? (
                          <span className="line-clamp-1">
                            {repliedMessage.content ?? (repliedMessage.attachment_type ? "Attachment" : "")}
                          </span>
                        ) : (
                          <span className="italic">Original message unavailable</span>
                        )}
                      </div>
                    )}
                    <MessageAttachment message={m} />
                    {m.content && (
                      <div className={m.attachment_type ? "px-4 py-2.5" : ""}>
                        <Linkify text={m.content} />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setReplyTo(m)}
                      aria-label="Reply"
                      className="p-1 text-text3 hover:text-green"
                    >
                      <IconArrowBackUp size={14} />
                    </button>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        aria-label="Delete message"
                        className="p-1 text-text3 hover:text-pink"
                      >
                        <IconTrash size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {showSeen && <span className="mt-0.5 px-1 text-[10px] text-text3/70">Seen</span>}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {otherTyping && (
        <p className="border-t border-border bg-bg2 px-4 pt-2 text-[12px] italic text-text3">{otherParticipant.display_name} is typing…</p>
      )}

      {status === "pending" && !isRequester && (
        <div className="flex flex-col items-center gap-3 border-t border-border bg-bg2 px-4 py-4 text-center">
          <p className="text-[13px] text-text2">
            {otherParticipant.display_name} wants to send you a message.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleDecline} disabled={decisionPending} className="btn-secondary px-5 py-2 text-[13px]">
              Decline
            </button>
            <button type="button" onClick={handleAccept} disabled={decisionPending} className="btn-primary px-5 py-2 text-[13px]">
              Accept
            </button>
          </div>
        </div>
      )}

      {status === "declined" && (
        <p className="border-t border-border bg-bg2 px-4 py-3 text-center text-[12px] text-text3">This request was declined.</p>
      )}

      {canCompose && (
        <form onSubmit={handleSend} className="flex flex-col gap-2 border-t border-border bg-bg2 p-4">
          {status === "pending" && isRequester && (
            <p className="text-center text-[12px] text-text3">Request sent -- {otherParticipant.display_name} hasn&apos;t accepted yet.</p>
          )}
          {replyTo && (
            <div className="flex items-center gap-2 rounded-card-sm border border-border2 bg-bg3 px-3 py-2 text-[12px] text-text2">
              <IconArrowBackUp size={14} className="shrink-0 text-text3" />
              <span className="min-w-0 flex-1 truncate">
                {replyTo.content ?? (replyTo.attachment_type ? "Attachment" : "")}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="shrink-0 text-text3 hover:text-pink">
                <IconX size={14} />
              </button>
            </div>
          )}
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
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setGifPickerOpen((v) => !v)}
                disabled={!!attachment}
                aria-label="Send a GIF"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-50"
              >
                <IconGif size={18} />
              </button>
              {gifPickerOpen && <GifPicker onSelect={handleGifSelect} onClose={() => setGifPickerOpen(false)} />}
            </div>
            <input
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Message…"
              maxLength={2000}
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
      )}
      {error && <p className="border-t border-border px-4 py-2 text-[12px] text-pink">{error}</p>}
    </div>
  );
}

function formatMessageTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function MessageAvatar({ name, avatarUrl, show }: { name: string; avatarUrl: string | null; show: boolean }) {
  if (!show) return <span className="w-6 shrink-0" />;
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

function MessageAttachment({ message }: { message: ProfileDmMessage }) {
  if (!message.attachment_type || !message.attachment_url) return null;

  if (message.attachment_type === "image" || message.attachment_type === "gif") {
    return (
      <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL / external GIF CDN, not a static remote pattern next/image can optimize */}
        <img src={message.attachment_url} alt="" className="max-h-64 w-full object-cover" />
      </a>
    );
  }

  if (message.attachment_type === "video") {
    return <video src={message.attachment_url} controls className="max-h-64 w-full" />;
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
