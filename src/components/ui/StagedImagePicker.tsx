"use client";

import { useEffect, useRef, useState } from "react";
import { IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import { ImageCropModal } from "@/components/ui/ImageCropModal";

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COVER_ASPECT = 3;

/**
 * Same picking/crop UX as SingleImageUploader, but deliberately does not
 * touch Supabase at all -- there's no entity id yet to key a storage path
 * on during a create form. Holds the picked (and, for covers, cropped)
 * Blob in memory; the parent form uploads it itself once the real entity
 * exists (see NewCommunityForm/NewEventForm), matching "add photos while
 * creating, not after" instead of the old create-then-edit-to-add-images
 * flow.
 */
export function StagedImagePicker({
  shape,
  label,
  value,
  onChange,
}: {
  shape: "square" | "wide";
  label: string;
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Genuinely controlled by `value` (an external reset -- e.g. a "clear
  // form" action -- should be reflected here), not just a one-way onChange
  // callback with disconnected internal state. An object URL is a real
  // browser resource tied to component lifetime, not derivable during
  // render (React can render without committing) -- creating/revoking it
  // is exactly the "synchronize with an external system" case useEffect is
  // for, which is why this needs the effect rather than the render-time
  // "adjusting state when a prop changes" pattern used elsewhere in this
  // codebase for plain derived state.
  /* eslint-disable react-hooks/set-state-in-effect -- see comment above: both
     branches synchronize previewUrl with the real object-URL resource just
     created/torn down in this same effect, not a value derivable at render
     time. */
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleFile(file: File) {
    setError("");
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 3MB");
      return;
    }

    if (shape === "wide") {
      setCropSrc(URL.createObjectURL(file));
    } else {
      onChange(file);
    }
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  function handleCropConfirm(blob: Blob) {
    closeCrop();
    onChange(blob);
  }

  const dims = shape === "square" ? "h-20 w-20" : "h-24 w-full max-w-xs";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-text3">{label}</span>
      <div className={`group relative overflow-hidden rounded-card-sm ${dims}`}>
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a real remote image yet */}
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => inputRef.current?.click()}
                aria-label={`Replace ${label.toLowerCase()}`}
                className="text-white transition hover:text-green"
              >
                <IconPhotoPlus size={18} />
              </button>
              <button
                onClick={() => onChange(null)}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="text-white transition hover:text-pink"
              >
                <IconTrash size={18} />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-card-sm border border-dashed border-border2 text-text3 transition hover:border-green hover:text-green"
          >
            <IconPhotoPlus size={20} />
            <span className="text-[10px] font-medium">Upload</span>
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

      {error && <p className="text-[12px] text-pink">{error}</p>}

      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} aspect={COVER_ASPECT} onCancel={closeCrop} onConfirm={handleCropConfirm} />
      )}
    </div>
  );
}
