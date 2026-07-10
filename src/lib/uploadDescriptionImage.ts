import { createClient } from "@/lib/supabase/client";

// Images embedded inline in a rich description -- uploaded straight into
// the same public bucket the entity's other images already use
// (community-images / event-images), under a new description/ path
// segment. No new bucket or RLS policy needed: the existing
// bucket_insert_owner/_host policies only check the first path segment
// (the entity's own id), not which subfolder follows it -- same reason
// logo/cover/gallery already coexisted in one bucket per entity type.
export async function uploadDescriptionImage(
  file: File,
  bucket: "community-images" | "event-images",
  entityId: string,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${entityId}/description/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
