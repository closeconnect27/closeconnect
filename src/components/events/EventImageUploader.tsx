"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPhotoPlus, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { addEventImage, removeEventImage } from "@/app/actions/events";
import type { EventImage } from "@/lib/queries/events";

const MAX_IMAGES = 3;
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// The app's first real file upload (everything else uses seeded Unsplash
// category images) -- client-side type/size checks are UX only, the actual
// enforcement is the storage bucket's own file_size_limit/allowed_mime_types
// (0008_event_images_storage.sql) plus the 3-image cap trigger
// (0003_event_images.sql), so a client bypassing this component entirely
// still can't exceed either limit (SPEC.md Section 11).
export function EventImageUploader({ eventId, images }: { eventId: string; images: EventImage[] }) {
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
    const path = `${eventId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("event-images").upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
    });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("event-images").getPublicUrl(path);
    const result = await addEventImage(eventId, data.publicUrl);
    if (result.error) {
      await supabase.storage.from("event-images").remove([path]);
      setError(result.error);
    } else {
      router.refresh();
    }
    setUploading(false);
  }

  async function handleRemove(image: EventImage) {
    setError("");
    const path = image.image_url.split("/event-images/")[1];
    if (!path) return;
    const result = await removeEventImage(eventId, image.id, path);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <div key={img.id} className="group relative h-20 w-20 overflow-hidden rounded-card-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- host-uploaded, not from next/image's configured remote patterns */}
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
      <p className="mt-2 text-[11px] text-text3">Up to 3 photos, JPEG/PNG/WebP, 3MB max each.</p>
    </div>
  );
}
