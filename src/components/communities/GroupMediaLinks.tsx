import { IconPhoto, IconFile, IconLink, IconExternalLink } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ChatMediaItem, ChatLinkItem } from "@/lib/queries/chat";

// Server-rendered, no client interactivity beyond plain anchors -- this tab
// is a recency scan of what's already in the chat (getGroupMediaAndLinks),
// not a live view, so it doesn't need GroupChat's realtime subscription.
export function GroupMediaLinks({ media, links }: { media: ChatMediaItem[]; links: ChatLinkItem[] }) {
  if (media.length === 0 && links.length === 0) {
    return <EmptyState icon={IconPhoto} title="Nothing shared yet" description="Images, files, and links posted in this group show up here." compact />;
  }

  return (
    <div className="flex flex-col gap-6">
      {media.length > 0 && (
        <div>
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Media</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((m) =>
              m.attachment_type === "image" && m.attachment_url ? (
                <a
                  key={m.id}
                  href={m.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-card-sm bg-bg3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static remote pattern next/image can optimize */}
                  <img src={m.attachment_url} alt="" className="h-full w-full object-cover transition hover:opacity-80" />
                </a>
              ) : (
                <a
                  key={m.id}
                  href={m.attachment_url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-card-sm border border-border2 bg-bg3 p-2 text-center transition hover:border-green"
                >
                  <IconFile size={20} className="text-text3" />
                  <span className="line-clamp-2 text-[11px] text-text3">{m.attachment_name ?? "File"}</span>
                </a>
              ),
            )}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Links</h2>
          <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-bg3"
              >
                <IconLink size={16} className="shrink-0 text-text3" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-green underline">{l.url}</span>
                <IconExternalLink size={14} className="shrink-0 text-text3" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
