"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPhotoPlus, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { ImageCropModal } from "@/components/ui/ImageCropModal";

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Matches the banner's rendered proportions closely enough across
// breakpoints (h-40/h-48 mobile up to h-52/h-64 desktop, full width) without
// excessive letterboxing at either end -- covers only, logos stay a plain
// center-cropped square (see `shape` below).
const COVER_ASPECT = 3;

/**
 * Single-slot image upload (a logo, a cover) shared by communities and
 * events -- the actual storage bucket/DB column differ per caller (passed
 * in as `bucket` and the `onUpload`/`onRemove` server actions), but the
 * upload/replace/remove mechanics, validation, and UI are identical, so
 * this is the one place that logic lives rather than copy-pasted per
 * owner type. Client-side type/size checks are UX only -- each bucket's
 * own file_size_limit/allowed_mime_types is the real enforcement.
 */
export function SingleImageUploader({
  bucket,
  pathPrefix,
  currentUrl,
  shape,
  label,
  onUpload,
  onRemove,
}: {
  bucket: string;
  pathPrefix: string;
  currentUrl: string | null;
  shape: "square" | "wide";
  label: string;
  onUpload: (imageUrl: string) => Promise<{ error: string | null }>;
  onRemove: (storagePath: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  async function uploadBlob(blob: Blob, ext: string, contentType: string) {
    setUploading(true);
    const supabase = createClient();
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType,
      cacheControl: "3600",
    });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const oldPath = currentUrl?.split(`/${bucket}/`)[1];
    const result = await onUpload(data.publicUrl);
    if (result.error) {
      await supabase.storage.from(bucket).remove([path]);
      setError(result.error);
    } else {
      if (oldPath) await supabase.storage.from(bucket).remove([oldPath]);
      router.refresh();
    }
    setUploading(false);
  }

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

    // Covers get a crop/zoom step so the uploader picks what stays visible
    // instead of always landing on whatever object-cover's default center
    // crop happens to show -- logos are square avatars, already fine as a
    // plain center crop, so this only applies to the wide shape.
    if (shape === "wide") {
      setCropSrc(URL.createObjectURL(file));
    } else {
      uploadBlob(file, file.name.split(".").pop() ?? "jpg", file.type);
    }
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function handleCropConfirm(blob: Blob) {
    closeCrop();
    await uploadBlob(blob, "jpg", "image/jpeg");
  }

  async function handleRemove() {
    setError("");
    const path = currentUrl?.split(`/${bucket}/`)[1];
    if (!path) return;
    const result = await onRemove(path);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  const dims = shape === "square" ? "h-20 w-20" : "h-24 w-full max-w-xs";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-text3">{label}</span>
      <div className={`group relative overflow-hidden rounded-card-sm ${dims}`}>
        {currentUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns */}
            <img src={currentUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                aria-label={`Replace ${label.toLowerCase()}`}
                className="text-white transition hover:text-green"
              >
                {uploading ? <IconLoader2 size={18} className="animate-spin" /> : <IconPhotoPlus size={18} />}
              </button>
              <button
                onClick={handleRemove}
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
            disabled={uploading}
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-card-sm border border-dashed border-border2 text-text3 transition hover:border-green hover:text-green disabled:opacity-50"
          >
            {uploading ? <IconLoader2 size={20} className="animate-spin" /> : <IconPhotoPlus size={20} />}
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
