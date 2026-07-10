// Canvas-based crop extraction for ImageCropModal -- the standard pattern
// from react-easy-crop's own docs (getCroppedImg), not reinvented.
export type CropPixels = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = src;
  });
}

export async function getCroppedImageBlob(
  imageSrc: string,
  crop: CropPixels,
  // Covers are decorative banners -- always jpeg, smaller for a large
  // area and never need transparency. Logos are square avatars that are
  // often uploaded as a transparent PNG (a mark on no background) -- jpeg
  // would flatten that to an opaque fill and visibly change the logo, so
  // this defaults to jpeg but callers with transparency to preserve pass
  // "png" explicitly.
  format: "jpeg" | "png" = "jpeg",
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))), mimeType, 0.9);
  });
}
