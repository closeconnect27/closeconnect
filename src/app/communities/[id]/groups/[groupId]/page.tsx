import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { canReadGroup, canPostToGroup, getGroupMessages, getGroupById, getGroupMediaAndLinks } from "@/lib/queries/chat";
import { markGroupRead } from "@/app/actions/chat";
import { GroupChat } from "@/components/communities/GroupChat";
import { GroupChatTabs } from "@/components/communities/GroupChatTabs";
import { GroupMediaLinks } from "@/components/communities/GroupMediaLinks";

export default async function GroupChatPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  const user = await requireUser(); // chat requires an account, same as joining (SPEC.md Section 1)
  const supabase = await createClient();

  let group;
  try {
    group = await getGroupById(supabase, groupId);
  } catch {
    notFound();
  }
  if (group.community_id !== id) notFound();

  // Announcement groups: readable by any community member, decoupled from
  // having separately joined this specific sub-group (0020) -- every other
  // group still requires an explicit join.
  const canRead = await canReadGroup(supabase, group, user.id);
  if (!canRead) redirect(`/communities/${id}`);

  const canPost = await canPostToGroup(supabase, group, user.id);
  const messages = await getGroupMessages(supabase, groupId);
  const { media, links } = await getGroupMediaAndLinks(supabase, groupId);

  // Fire-and-forget-adjacent: awaited so it's committed before the badge
  // could plausibly be re-fetched by a nav elsewhere, but never awaited by
  // the caller of a return value -- this page doesn't hold up rendering
  // waiting on it. A failed mark-read just means the badge doesn't clear
  // this one visit, not a broken chat.
  markGroupRead(groupId).catch((e) => console.error("Failed to mark group read:", e));

  return (
    // flex-1, not h-full -- this div's parent (SiteChrome's wrapper) sizes
    // it via flex-grow already; a percentage height here would need that
    // parent to have already resolved its own height by paint time, which
    // doesn't reliably hold on every mobile browser (the exact bug fixed
    // on the homepage hero -- see Hero.tsx's own comment on this).
    <div className="flex flex-1 flex-col overflow-hidden px-4 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col">
        <div className="shrink-0 pb-3">
          <Link
            href={`/communities/${id}`}
            className="mb-2 inline-block text-[13px] text-text3 transition hover:text-text2"
          >
            ← Back to community
          </Link>
          <h1 className="font-heading text-[18px] font-bold">#{group.name}</h1>
        </div>
        <div className="flex min-h-0 flex-1 flex-col pb-4">
          <GroupChatTabs
            chat={<GroupChat groupId={groupId} initialMessages={messages} currentUserId={user.id} canPost={canPost} />}
            media={<GroupMediaLinks media={media} links={links} />}
          />
        </div>
      </div>
    </div>
  );
}
