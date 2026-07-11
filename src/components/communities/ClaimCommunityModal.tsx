"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconPaperclip, IconTrash } from "@tabler/icons-react";
import { claimCommunitySchema } from "@/lib/validation/community";
import { submitCommunityClaim } from "@/app/actions/communities";
import { uploadClaimProofImage } from "@/lib/uploadClaimProofImage";

const MAX_IMAGES = 5;

export function ClaimCommunityModal({
  communityId,
  email,
  onClose,
}: {
  communityId: string;
  email?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [proof, setProof] = useState("");
  const [images, setImages] = useState<{ path: string; previewUrl: string }[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`Up to ${MAX_IMAGES} images`);
      return;
    }

    setUploadingImages(true);
    for (const file of Array.from(files).slice(0, remaining)) {
      const { path, error: uploadError } = await uploadClaimProofImage(file, communityId);
      if (uploadError || !path) {
        setError(uploadError ?? "Could not upload image");
        continue;
      }
      setImages((prev) => [...prev, { path, previewUrl: URL.createObjectURL(file) }]);
    }
    setUploadingImages(false);
  }

  function removeImage(path: string) {
    setImages((prev) => prev.filter((img) => img.path !== path));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = claimCommunitySchema.safeParse({
      name,
      phone,
      proof: proof || undefined,
      proofImagePaths: images.map((img) => img.path),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setStatus("submitting");
    startTransition(async () => {
      const result = await submitCommunityClaim(communityId, parsed.data);
      if (result?.error) {
        setError(result.error);
        setStatus("error");
      } else {
        setStatus("done");
        router.refresh();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[420px] rounded-card bg-bg2 p-6 shadow-card-hover">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="font-heading text-[20px] font-bold">Claim this community</div>
            <div className="text-[13px] text-text2">We&apos;ll review and follow up</div>
          </div>
          <button onClick={onClose} className="text-text2 transition hover:text-text">
            <IconX size={18} />
          </button>
        </div>

        {status === "done" ? (
          <p className="py-4 text-center text-[14px] text-text2">
            Claim submitted -- an admin will review it shortly.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              required
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">We&apos;ll contact you at</span>
              <p className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text2">{email}</p>
            </div>
            <textarea
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="Proof you run this community (optional) -- a link, screenshot URL, etc."
              rows={3}
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />

            <div className="flex flex-col gap-2">
              <label className="btn-secondary w-fit cursor-pointer px-4 py-2 text-[13px]">
                <IconPaperclip size={14} />
                {uploadingImages ? "Uploading…" : "Attach proof images"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={uploadingImages || images.length >= MAX_IMAGES}
                  onChange={(e) => {
                    void handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    <div key={img.path} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a next/image remote pattern */}
                      <img src={img.previewUrl} alt="" className="h-16 w-16 rounded-card-sm border border-border2 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(img.path)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg text-text2 shadow-card transition hover:text-pink"
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-[13px] text-pink">{error}</p>}

            <button type="submit" disabled={status === "submitting"} className="btn-primary mt-1 py-3 text-[14px]">
              {status === "submitting" ? "Submitting…" : "Submit claim"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
