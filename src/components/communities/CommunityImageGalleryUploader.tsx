"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPhotoPlus, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { addCommunityImage, removeCommunityImageFromGallery } from "@/app/actions/communities";
import type { CommunityImage } from "@/lib/queries/communities";

const MAX_IMAGES = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Mirrors EventImageUploader exactly -- a gallery separate from the single
// logo/cover, same client-side checks (UX only; the storage bucket's own
// limits plus the 5-image cap trigger, 0032, are the real enforcement).
export function CommunityImageGalleryUploader({
  communityId,
  images,
}: {
  communityId: string;
  images: CommunityImage[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 3MB");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${communityId}/gallery/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("community-images").upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
    });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("community-images").getPublicUrl(path);
    const result = await addCommunityImage(communityId, data.publicUrl);
    if (result.error) {
      await supabase.storage.from("community-images").remove([path]);
      setError(result.error);
    } else {
      router.refresh();
    }
    setUploading(false);
  }

  async function handleRemove(image: CommunityImage) {
    setError("");
    const path = image.image_url.split("/community-images/")[1];
    if (!path) return;
    const result = await removeCommunityImageFromGallery(communityId, image.id, path);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <div key={img.id} className="group relative h-20 w-20 overflow-hidden rounded-card-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns */}
            <img src={img.image_url} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => handleRemove(img)}
              aria-label="Remove image"
              className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            >
              <IconTrash size={18} />
            </button>
          </div>
        ))}

        {images.length < MAX_IMAGES && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-card-sm border border-dashed border-border2 text-text3 transition hover:border-green hover:text-green disabled:opacity-50"
          >
            {uploading ? <IconLoader2 size={20} className="animate-spin" /> : <IconPhotoPlus size={20} />}
            <span className="text-[10px] font-medium">Add photo</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {error && <p className="mt-2 text-[12px] text-pink">{error}</p>}
      <p className="mt-2 text-[11px] text-text3">Up to 5 photos, JPEG/PNG/WebP, 3MB max each.</p>
    </div>
  );
}
