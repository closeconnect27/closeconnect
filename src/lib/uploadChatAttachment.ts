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

export type ChatAttachment = { path: string; type: "image" | "video" | "file" | "voice"; name: string; durationSeconds?: number };

export async function uploadChatAttachment(
  file: File,
  folderPrefix: string,
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
  const path = `${folderPrefix}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) return { attachment: null, error: error.message };

  return { attachment: { path, type, name: file.name }, error: null };
}

const VOICE_NOTE_LIMIT = 25 * 1024 * 1024;

// The recorder (voiceRecording.ts) hands back a raw Blob from
// MediaRecorder, not a File from an <input> picker -- same bucket/path
// convention as uploadChatAttachment, just a fixed "voice" classification
// and content type instead of sniffing one from a picked file.
export async function uploadVoiceNote(blob: Blob, folderPrefix: string, durationSeconds: number): Promise<{ attachment: ChatAttachment | null; error: string | null }> {
  if (blob.size > VOICE_NOTE_LIMIT) return { attachment: null, error: "That recording is larger than the 25MB limit." };

  const supabase = createClient();
  // MediaRecorder's blob.type carries a codec parameter (e.g.
  // "audio/webm;codecs=opus") that the storage bucket's allowed_mime_types
  // allowlist matches exactly against -- stripped here so a real recording
  // doesn't get rejected over a suffix the allowlist was never going to
  // enumerate every variant of.
  const mimeType = (blob.type || "audio/webm").split(";")[0].trim();
  const ext = mimeType.includes("mp4") ? "m4a" : "webm";
  const path = `${folderPrefix}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("chat-attachments").upload(path, blob, {
    contentType: mimeType,
    cacheControl: "3600",
  });
  if (error) return { attachment: null, error: error.message };

  return { attachment: { path, type: "voice", name: "Voice message", durationSeconds }, error: null };
}
