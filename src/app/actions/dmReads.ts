"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { DmThreadKind } from "@/lib/queries/dmReads";

/** Marks a thread (community or event) as read up to now for the calling
 * user -- called whenever they open that specific thread's conversation.
 * RLS (dm_reads_upsert_own/dm_reads_update_own) is the real gate; this
 * can't mark a thread read for anyone but the caller. */
export async function markDmThreadRead(kind: DmThreadKind, threadId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dm_reads")
    .upsert(
      { thread_kind: kind, thread_id: threadId, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "thread_kind,thread_id,user_id" },
    );
  // Best-effort -- a failed read-marker just means the badge stays lit a
  // little longer, not a broken feature.
  if (error) console.error("markDmThreadRead failed:", error.message);
}
