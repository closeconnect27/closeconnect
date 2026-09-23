import { IconMessageCircle2 } from "@tabler/icons-react";

export const metadata = { title: "Messages" };

// The right-hand pane's resting state when no thread is selected -- data
// fetching/auth now live in layout.tsx (shared with /messages/[threadId]),
// this is just the placeholder content shown beside the list.
export default function MessagesIndexPage() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <IconMessageCircle2 size={36} className="text-text3" />
      <p className="font-heading text-[16px] font-bold text-text">Your messages</p>
      <p className="text-[13px] text-text3">Select a conversation to start chatting.</p>
    </div>
  );
}
