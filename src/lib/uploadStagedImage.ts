import { createClient } from "@/lib/supabase/client";

/** Uploads a staged (not-yet-persisted) image Blob/File to storage once the
 * owning entity finally has a real id -- used right after create forms
 * (community/event) create the row, so images picked during creation land
 * in the same place edit-time uploads do. Returns the public URL, or null
 * on failure (the caller decides how to surface that; the entity itself
 * already exists by this point, so a failed image upload isn't fatal). */
export async function uploadStagedImage(bucket: string, path: string, blob: Blob, contentType: string) {
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, cacheControl: "3600" });
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
