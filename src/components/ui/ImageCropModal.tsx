"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageBlob } from "@/lib/cropImage";

// Shared by both cover photos and logos (see SingleImageUploader) -- aspect
// and title are the only things that differ between them. Drag to
// reposition, slider to zoom, fixed aspect so the output always matches
// where it'll render -- "the image shouldn't just land wherever the
// browser happens to center-crop it."
export function ImageCropModal({
  imageSrc,
  aspect,
  title = "Adjust photo",
  outputFormat = "jpeg",
  onCancel,
  onConfirm,
}: {
  imageSrc: string;
  aspect: number;
  title?: string;
  outputFormat?: "jpeg" | "png";
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => setCroppedAreaPixels(pixels), []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    setError("");
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, outputFormat);
      onConfirm(blob);
    } catch {
      setError("Could not process this image. Try a different file.");
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-card bg-bg2 p-4">
        <h2 className="font-heading text-[16px] font-bold">{title}</h2>
        <div className="relative h-64 w-full overflow-hidden rounded-card-sm bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text3">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-green"
          />
        </div>
        {error && <p className="text-[12px] text-pink">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={processing} className="btn-secondary px-4 py-2 text-[13px]">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            className="btn-primary px-4 py-2 text-[13px]"
          >
            {processing ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
