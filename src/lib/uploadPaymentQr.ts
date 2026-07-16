import { createClient } from "@/lib/supabase/client";

// Same 3MB/image-mime limits as the payment-qr bucket itself (0066) --
// enforced here too so a rejected upload fails fast client-side instead of
// round-tripping to storage first.
const MAX_SIZE = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadPaymentQr(file: File, userId: string): Promise<{ url: string | null; error: string | null }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: "Use a JPG, PNG, or WEBP image" };
  }
  if (file.size > MAX_SIZE) {
    return { url: null, error: "Image must be under 3MB" };
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "png";
  // Path convention: {user_id}/{uuid}.ext -- storage RLS (0066) checks the
  // first path segment against auth.uid(), same shape as every other
  // per-owner bucket in this app.
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("payment-qr").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from("payment-qr").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
