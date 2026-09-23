"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconX,
  IconUser,
  IconBellOff,
  IconBell,
  IconBan,
  IconTrash,
  IconPhoto,
  IconChevronRight,
  IconChevronLeft,
  IconFile,
  IconDownload,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { muteProfileDmThread, unmuteProfileDmThread, deleteProfileDmChat } from "@/app/actions/profileDm";
import { blockUser, unblockUser } from "@/app/actions/block";
import { createClient } from "@/lib/supabase/client";
import { resolveDmAttachmentUrl, type DmMediaItem, type ProfileDmAttachmentType } from "@/lib/queries/profileDm";

type OtherParticipant = { id: string; display_name: string; avatar_url: string | null };

// Website counterpart to the native app's dm-info screen -- opened by
// tapping the thread header's name/avatar (messages/[threadId]/page.tsx)
// instead of navigating straight to /profile/[id]. Same five options:
// Profile / Mute / Block / Delete chat / Media & links.
export function ChatInfoPanel({
  threadId,
  otherParticipant,
  muted,
  onMutedChange,
  blocked,
  onBlockedChange,
  onClose,
}: {
  threadId: string;
  otherParticipant: OtherParticipant;
  // Controlled by the parent (DmThreadHeader), not local state -- this
  // panel is conditionally mounted ({open && <ChatInfoPanel .../>}), so
  // state local to it would reset to stale server-fetched values every
  // time it's closed and reopened in the same page view. See
  // DmThreadHeader's own comment for the bug that caused (a re-block
  // attempt silently failing on the DB's primary key with no error shown).
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  blocked: boolean;
  onBlockedChange: (blocked: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<"menu" | "media">("menu");
  const [pending, startTransition] = useTransition();
  const [media, setMedia] = useState<DmMediaItem[] | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (view !== "media" || media !== null) return;
    const supabase = createClient();
    supabase
      .from("profile_dm_messages")
      .select("id, attachment_path, attachment_type, attachment_name")
      .eq("thread_id", threadId)
      .not("attachment_path", "is", null)
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const rows = (data ?? []) as unknown as Array<{ id: string; attachment_path: string; attachment_type: ProfileDmAttachmentType; attachment_name: string | null }>;
        const resolved = await Promise.all(
          rows.map(async (r) => ({ ...r, attachment_url: await resolveDmAttachmentUrl(supabase, r.attachment_path, r.attachment_type) })),
        );
        setMedia(resolved);
      });
  }, [view, media, threadId]);

  function handleToggleMute() {
    setActionError("");
    const next = !muted;
    onMutedChange(next);
    startTransition(async () => {
      const result = next ? await muteProfileDmThread(threadId) : await unmuteProfileDmThread(threadId);
      if (result.error) {
        onMutedChange(!next);
        setActionError(result.error);
      }
    });
  }

  function handleToggleBlock() {
    if (!blocked && !window.confirm(`Block ${otherParticipant.display_name}? They won't be able to message or follow you anymore.`)) return;
    setActionError("");
    const next = !blocked;
    onBlockedChange(next);
    startTransition(async () => {
      const result = next ? await blockUser(otherParticipant.id) : await unblockUser(otherParticipant.id);
      if (result.error) {
        onBlockedChange(!next);
        setActionError(result.error);
      }
    });
  }

  function handleDeleteChat() {
    if (!window.confirm("Delete this chat? It comes back if a new message arrives.")) return;
    startTransition(async () => {
      await deleteProfileDmChat(threadId);
      router.push("/messages");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-sm overflow-hidden rounded-t-card border border-border bg-bg2 sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          {view === "media" ? (
            <button type="button" onClick={() => setView("menu")} aria-label="Back" className="flex items-center gap-1 text-[13px] text-text3 hover:text-text2">
              <IconChevronLeft size={16} />
              Chat info
            </button>
          ) : (
            <span className="font-heading text-[14px] font-bold text-text">Chat info</span>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="text-text3 hover:text-text2">
            <IconX size={18} />
          </button>
        </div>

        {view === "menu" ? (
          <div className="max-h-[65vh] overflow-y-auto">
            <div className="flex flex-col items-center gap-2 px-4 py-6">
              {otherParticipant.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
                <img src={otherParticipant.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-tint text-[22px] font-bold text-green">
                  {otherParticipant.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="max-w-full truncate px-2 text-center font-heading text-[16px] font-bold text-text">{otherParticipant.display_name}</span>
            </div>

            <InfoRow icon={<IconUser size={18} />} label="Profile" href={`/profile/${otherParticipant.id}`} />
            <InfoRow
              icon={muted ? <IconBellOff size={18} /> : <IconBell size={18} />}
              label={muted ? "Unmute notifications" : "Mute notifications"}
              onClick={handleToggleMute}
              disabled={pending}
            />
            <InfoRow icon={<IconPhoto size={18} />} label="Media & links" onClick={() => setView("media")} />
            <InfoRow
              icon={<IconBan size={18} />}
              label={blocked ? "Unblock" : "Block"}
              onClick={handleToggleBlock}
              disabled={pending}
              tone={blocked ? "muted" : "danger"}
              noChevron
            />
            <InfoRow icon={<IconTrash size={18} />} label="Delete chat" onClick={handleDeleteChat} disabled={pending} tone="danger" noChevron />
            {actionError && <p className="px-4 py-3 text-[12.5px] text-pink">{actionError}</p>}
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto p-3">
            {media === null ? (
              <p className="px-2 py-8 text-center text-[13px] text-text3">Loading…</p>
            ) : media.length === 0 ? (
              <p className="px-2 py-8 text-center text-[13px] text-text3">No shared media yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {media.map((item) => {
                  const isVisual = item.attachment_type === "image" || item.attachment_type === "video" || item.attachment_type === "gif";
                  if (!isVisual) {
                    return (
                      <a
                        key={item.id}
                        href={item.attachment_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="col-span-3 flex items-center gap-2 rounded-card-sm border border-border2 px-3 py-2.5 text-[13px] text-text2 hover:border-green hover:text-green"
                      >
                        <IconFile size={16} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.attachment_name ?? "File"}</span>
                        <IconDownload size={14} className="shrink-0" />
                      </a>
                    );
                  }
                  return (
                    <a
                      key={item.id}
                      href={item.attachment_url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square overflow-hidden rounded-card-sm bg-bg3"
                    >
                      {item.attachment_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL / external GIF CDN
                        <img src={item.attachment_url} alt="" className="h-full w-full object-cover" />
                      )}
                      {item.attachment_type === "video" && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <IconPlayerPlay size={20} className="text-white" />
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  href,
  onClick,
  disabled,
  tone = "default",
  noChevron,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "muted";
  noChevron?: boolean;
}) {
  const colorClass = tone === "danger" ? "text-pink" : tone === "muted" ? "text-text3" : "text-text";
  const content = (
    <>
      <span className={colorClass}>{icon}</span>
      <span className={`flex-1 text-[14px] font-medium ${colorClass}`}>{label}</span>
      {!noChevron && <IconChevronRight size={16} className="text-text3" />}
    </>
  );
  const className = "flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left transition hover:bg-bg3 disabled:cursor-default disabled:opacity-60";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  );
}
