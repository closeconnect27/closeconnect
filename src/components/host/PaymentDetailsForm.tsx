"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconQrcode } from "@tabler/icons-react";
import { updateHostPaymentDetails } from "@/app/actions/paymentDetails";
import { uploadPaymentQr } from "@/lib/uploadPaymentQr";
import type { HostPaymentDetails } from "@/lib/queries/paymentDetails";

// Shown inline while creating/editing an event, once a ticket type has a
// price -- not on the host dashboard (moved there originally, relocated
// here since a host thinks about payment details in the moment they're
// pricing a ticket, not as a standalone settings page). Saved against the
// host's account, though, not the event -- reused across every event they
// go on to host. Shown to a registrant at checkout (EventRegistration.tsx)
// so they can pay by hand via their own UPI app and type back whatever
// reference number it gave them (registerForEvent/submitPaymentReference
// in app/actions/events.ts).
export function PaymentDetailsForm({ userId, details }: { userId: string; details: HostPaymentDetails | null }) {
  const router = useRouter();
  const [upiId, setUpiId] = useState(details?.upi_id ?? "");
  const [qrUrl, setQrUrl] = useState<string | null>(details?.qr_image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setSaved(false);
    const result = await uploadPaymentQr(file, userId);
    setUploading(false);
    if (result.error) setError(result.error);
    else setQrUrl(result.url);
  }

  function save() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await updateHostPaymentDetails({ upi_id: upiId, qr_image_url: qrUrl });
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="card-elevated flex flex-col gap-4 rounded-card bg-bg2 p-5">
      <div>
        <h3 className="flex items-center gap-2 font-heading text-[14px] font-bold">
          <IconQrcode size={16} className="text-green" />
          Payment details
        </h3>
        <p className="mt-1 text-[12px] text-text3">
          Shown to anyone registering for one of your paid tickets, so they can pay you directly by UPI.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">UPI ID</span>
        <input
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          placeholder="yourname@upi"
          className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-text">QR code image</span>
        {qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- storage public URL, not a static remote pattern next/image can optimize
          <img src={qrUrl} alt="Payment QR code" className="h-40 w-40 rounded-card-sm border border-border2 object-contain" />
        )}
        <label className="btn-secondary w-fit cursor-pointer px-4 py-2 text-[13px]">
          {uploading ? "Uploading…" : qrUrl ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-[13px] text-pink">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green">Saved.</p>}

      <button onClick={save} disabled={pending || uploading} className="btn-primary w-fit px-6 py-2.5 text-[13px]">
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
