"use client";

import { useRef, useState } from "react";
import { IconPhotoPlus, IconTrash } from "@tabler/icons-react";

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Staged version of EventImageUploader/CommunityImageGalleryUploader for
 * create forms -- picks files and previews them locally, no upload until
 * the parent form has a real entity id to attach them to. */
export function StagedGalleryPicker({
  files,
  onChange,
  max = 5,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews] = useState(() => new Map<File, string>());
  const [error, setError] = useState("");

  function previewFor(file: File) {
    let url = previews.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      previews.set(file, url);
    }
    return url;
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
    onChange([...files, file]);
  }

  function handleRemove(file: File) {
    const url = previews.get(file);
    if (url) {
      URL.revokeObjectURL(url);
      previews.delete(file);
    }
    onChange(files.filter((f) => f !== file));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {files.map((file, i) => (
          <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-card-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a real remote image yet */}
            <img src={previewFor(file)} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => handleRemove(file)}
              aria-label="Remove image"
              className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            >
              <IconTrash size={18} />
            </button>
          </div>
        ))}

        {files.length < max && (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-card-sm border border-dashed border-border2 text-text3 transition hover:border-green hover:text-green"
          >
            <IconPhotoPlus size={20} />
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
      <p className="mt-2 text-[11px] text-text3">Up to {max} photos, JPEG/PNG/WebP, 3MB max each.</p>
    </div>
  );
}
