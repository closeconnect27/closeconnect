import { createClient } from "@/lib/supabase/client";

// Tighter per-kind limits than the bucket's own 25MB hard ceiling
// (0045_chat_attachments.sql) -- these are the actual UX-facing caps;
// the bucket limit is only the backstop against a client that skips this.
const LIMITS = {
  image: 5 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  file: 10 * 1024 * 1024,
} as const;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

function classify(file: File): "image" | "video" | "file" {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (VIDEO_TYPES.includes(file.type)) return "video";
  return "file";
}

export type ChatAttachment = { path: string; type: "image" | "video" | "file"; name: string };

export async function uploadChatAttachment(
  file: File,
  groupId: string,
): Promise<{ attachment: ChatAttachment | null; error: string | null }> {
  const type = classify(file);
  if (type === "file" && file.size > LIMITS.file) {
    return { attachment: null, error: "Files must be under 10MB" };
  }
  if (type === "image" && file.size > LIMITS.image) {
    return { attachment: null, error: "Images must be under 5MB" };
  }
  if (type === "video" && file.size > LIMITS.video) {
    return { attachment: null, error: "Videos must be under 25MB" };
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${groupId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) return { attachment: null, error: error.message };

  return { attachment: { path, type, name: file.name }, error: null };
}
