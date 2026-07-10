import type { SupabaseClient } from "@supabase/supabase-js";

// chat-attachments is a private bucket (0045) -- group members only, same
// privacy scope as the messages themselves. A stored attachment_path
// isn't fetchable as-is; every viewer needs their own signed URL, minted
// fresh (RLS-checked at mint time, not baked into a permanent public
// link). Works from either the server or browser client -- same
// interface, same policy check either way.
const SIGNED_URL_TTL_SECONDS = 3600;

export async function resolveAttachmentUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("chat-attachments").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
