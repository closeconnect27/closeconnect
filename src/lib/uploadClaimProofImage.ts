import { createClient } from "@/lib/supabase/client";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadClaimProofImage(
  file: File,
  communityId: string,
): Promise<{ path: string | null; error: string | null }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { path: null, error: "Only JPEG, PNG, or WEBP images are allowed" };
  }
  if (file.size > MAX_SIZE) {
    return { path: null, error: "Images must be under 5MB" };
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${communityId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("claim-proof-images").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) return { path: null, error: error.message };

  return { path, error: null };
}
